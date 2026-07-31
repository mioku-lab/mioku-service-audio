import * as path from "node:path";
import { audioLog } from "../utils/log";
import type {
  AudioServiceApi,
  AudioServiceStatus,
  AudioServiceSettings,
  ComputeDevice,
  GenerateByTextOptions,
  GenerateByTextResult,
  GptSovitsModel,
  ReferenceAudioManifestEntry,
  SupportedLang,
} from "../types";
import {
  buildTtsRequest,
  postInference,
  setGptWeights,
  setSovitsWeights,
} from "../api/client";
import { ReferenceAudioStore } from "./reference-audio";
import {
  defaultTempDir,
  ensureOutputDir,
  resolveOutputPath,
  writeBytes,
} from "./output";
import { detectLang } from "./language";
import {
  bootstrapInBackground,
  type BootstrapState,
} from "../bootstrap";
import type { RuntimeHandle } from "../bootstrap/runtime";
import { getModelSelection } from "../bootstrap/models";
import { SERVICE_NAME } from "../constants";

interface ServiceRuntime {
  status: AudioServiceStatus;
  bootstrapPromise: Promise<void>;
  settings: AudioServiceSettings;
  store: ReferenceAudioStore;
  runtime: RuntimeHandle | null;
  device: ComputeDevice | null;
  serviceDataDir: string;
  repoDir: string | null;
  listeners: Set<(state: BootstrapState) => void>;
  modelSwitchInFlight: Promise<void> | null;
}

export function createAudioService(opts: {
  initialSettings: AudioServiceSettings;
  serviceDataDir: string;
}): AudioServiceApi {
  return new AudioServiceImpl(opts);
}

class AudioServiceImpl implements AudioServiceApi {
  private readonly internal: ServiceRuntime;

  constructor(opts: {
    initialSettings: AudioServiceSettings;
    serviceDataDir: string;
  }) {
    const store = new ReferenceAudioStore(opts.serviceDataDir);
    this.internal = {
      status: buildStatus(opts.initialSettings),
      bootstrapPromise: Promise.resolve(),
      settings: { ...opts.initialSettings },
      store,
      runtime: null,
      device: null,
      serviceDataDir: opts.serviceDataDir,
      repoDir: null,
      listeners: new Set(),
      modelSwitchInFlight: null,
    };
  }

  getStatus(): AudioServiceStatus {
    return { ...this.internal.status };
  }

  ready(): Promise<boolean> {
    return this.internal.bootstrapPromise.then(() => this.internal.status.ready);
  }

  onBootstrapState(listener: (state: BootstrapState) => void): () => void {
    this.internal.listeners.add(listener);
    return () => {
      this.internal.listeners.delete(listener);
    };
  }

  start(): void {
    if ((this.internal as any)._started) return;
    (this.internal as any)._started = true;
    this.internal.bootstrapPromise = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.internal.store.ensureReady();
      this.notify("init", "正在初始化 audio 服务 ...", false);
      const result = await bootstrapInBackground({
        settings: this.internal.settings,
        serviceDataDir: this.internal.serviceDataDir,
        listener: (state) => this.notify(state.phase, state.message, state.ready),
      });
      this.internal.runtime = result.runtime;
      this.internal.device = result.device.device;
      this.internal.repoDir = path.join(this.internal.serviceDataDir, "GPT-SoVITS");
      this.internal.status = {
        ...this.internal.status,
        device: result.device.device,
        model: result.model,
        ready: true,
        bootstrapping: false,
        startedAt: Date.now(),
        pid: result.runtime.pid,
      };
    } catch (reason: any) {
      const message = reason?.message ?? String(reason);
      this.internal.status = {
        ...this.internal.status,
        ready: false,
        bootstrapping: false,
        lastError: message,
      };
      this.notify("error", `bootstrap 失败: ${message}`, false);
    }
  }

  private notify(phase: BootstrapState["phase"], message: string, ready: boolean) {
    const state: BootstrapState = { phase, message, ready };
    for (const listener of this.internal.listeners) {
      try {
        listener(state);
      } catch (err) {
        audioLog.warn(`bootstrap listener 调用失败: ${(err as Error).message}`);
      }
    }
  }

  async generateByText(options: GenerateByTextOptions): Promise<GenerateByTextResult> {
    if (!this.internal.status.ready || !this.internal.runtime) {
      throw new Error(
        `audio 服务尚未就绪 (currentStatus=${JSON.stringify(this.internal.status)})`,
      );
    }
    if (!options || !options.text) {
      throw new Error("generateByText 需要提供 text");
    }

    if (options.model && options.model !== this.internal.status.model) {
      await this.setActiveModel(options.model);
    }

    const runtime = this.internal.runtime!;
    const refStore = this.internal.store;
    await refStore.ensureReady();

    const effectiveRefAudioName = (
      options.refAudioName
      ?? (options.refAudioPath ? "" : this.internal.settings.defaultRefAudio)
    ).trim();

    const requestedLang = (options.textLang ?? this.internal.settings.defaultLang) as SupportedLang;
    const detected = detectLang(options.text, requestedLang);

    const refAudioPath = await resolveRefAudioPath(refStore, {
      ...options,
      refAudioName: effectiveRefAudioName || undefined,
    });
    const promptText = options.promptText
      ?? (await refStore.get(effectiveRefAudioName))?.promptText
      ?? "";
    const promptLang = options.promptLang
      ?? (await refStore.get(effectiveRefAudioName))?.lang
      ?? detected;

    const payload = buildTtsRequest(
      options.text,
      refAudioPath,
      promptText,
      String(promptLang ?? detected),
      detected,
      options,
    );

    const modelUsed = this.internal.status.model;
    const mediaExt = mediaExtFor(options.mediaType ?? "wav");
    const tempDir = options.outputDir ?? defaultTempDir();
    await ensureOutputDir(tempDir);
    const fileBase = options.fileName
      ?? `${Date.now()}_${slug(options.text)}_${modelUsed}`;

    const startedAt = Date.now();
    audioLog.info(
      `正在推理 (模型=${modelUsed}, lang=${detected}, refAudio=${effectiveRefAudioName || path.basename(refAudioPath)}): "${truncate(options.text)}"`,
    );

    const result = await postInference(
      runtime.apiBase,
      payload,
      this.internal.settings.inferenceTimeoutMs,
    );
    const inferenceMs = Date.now() - startedAt;
    const { filePath, fileName } = resolveOutputPath(tempDir, fileBase, mediaExt);
    await writeBytes(filePath, result.bytes);
    audioLog.info(`推理完成 -> ${filePath} (${inferenceMs}ms, ${(result.bytes.byteLength / 1024).toFixed(1)} KB)`);

    return {
      filePath,
      fileName,
      modelUsed,
      text: options.text,
      durationMs: inferenceMs,
      inferenceMs,
    };
  }

  async addReferenceAudio(input: {
    name: string;
    filePath: string;
    promptText: string;
    lang: SupportedLang;
  }): Promise<ReferenceAudioManifestEntry> {
    const entry = await this.internal.store.add({
      name: input.name,
      sourceFile: input.filePath,
      promptText: input.promptText,
      lang: input.lang,
    });
    audioLog.info(`已添加参考音频: ${entry.name} -> ${entry.fileName}`);
    return entry;
  }

  async removeReferenceAudio(name: string): Promise<boolean> {
    const removed = await this.internal.store.remove(name);
    if (removed) audioLog.info(`已移除参考音频: ${name}`);
    return removed;
  }

  async listReferenceAudios(): Promise<ReferenceAudioManifestEntry[]> {
    return this.internal.store.list();
  }

  async getReferenceAudio(name: string): Promise<ReferenceAudioManifestEntry | null> {
    return this.internal.store.get(name);
  }

  getActiveModel(): GptSovitsModel {
    return this.internal.status.model;
  }

  async setActiveModel(model: GptSovitsModel): Promise<void> {
    if (!this.internal.runtime || !this.internal.repoDir) {
      this.internal.status = { ...this.internal.status, model };
      return;
    }
    if (this.internal.modelSwitchInFlight) {
      await this.internal.modelSwitchInFlight;
    }
    this.internal.modelSwitchInFlight = this.doSwitchModel(model);
    try {
      await this.internal.modelSwitchInFlight;
    } finally {
      this.internal.modelSwitchInFlight = null;
    }
  }

  private async doSwitchModel(model: GptSovitsModel): Promise<void> {
    if (!this.internal.runtime || !this.internal.repoDir) return;
    const selection = getModelSelection(model);
    const sot = path.join(this.internal.repoDir, selection.vitsWeights);
    const gpt = path.join(this.internal.repoDir, selection.t2sWeights);
    audioLog.info(`切换模型到 ${model} (Sovits=${sot}, GPT=${gpt})`);
    await setSovitsWeights(this.internal.runtime.apiBase, sot);
    await setGptWeights(this.internal.runtime.apiBase, gpt);
    this.internal.status = { ...this.internal.status, model };
    audioLog.info(`模型已切换到 ${model}`);
  }

  listSupportedModels(): GptSovitsModel[] {
    return ["v2", "v2Pro", "v2ProPlus", "v4"];
  }
}

function buildStatus(settings: AudioServiceSettings): AudioServiceStatus {
  return {
    ready: false,
    bootstrapping: true,
    device: null,
    model: settings.model,
    host: settings.host,
    port: settings.port,
  };
}

async function resolveRefAudioPath(
  store: ReferenceAudioStore,
  options: GenerateByTextOptions,
): Promise<string> {
  if (options.refAudioPath) return options.refAudioPath;
  const name = (options.refAudioName ?? "").trim();
  if (!name) {
    throw new Error(
      "generateByText 需要提供 refAudioName 或 refAudioPath，至少一个参考音频",
    );
  }
  const path_ = await store.resolveAudioPath(name);
  if (!path_) {
    throw new Error(`未找到参考音频: ${name}`);
  }
  return path_;
}

function mediaExtFor(media: "wav" | "ogg" | "aac" | "raw"): string {
  if (media === "raw") return ".pcm";
  return `.${media}`;
}

function truncate(text: string): string {
  const max = 40;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function slug(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return cleaned || "voice";
}

export function serviceName(): string {
  return SERVICE_NAME;
}
