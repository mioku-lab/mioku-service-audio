import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { audioLog } from "../utils/log";
import { spawnDetached, type SpawnHandle } from "../utils/process";
import { runCommand } from "mioku";
import type { ComputeDevice, GptSovitsModel } from "../types";
import { getModelSelection } from "./models";
import { RUNTIME_LOG_FILENAME } from "../constants";

export interface StartOptions {
  repoDir: string;
  pythonBin: string;
  host: string;
  port: number;
  model: GptSovitsModel;
  device: ComputeDevice;
  isHalf: boolean;
  logPath: string;
  readyKeyword?: string;
  readyTimeoutMs: number;
  extraEnv?: NodeJS.ProcessEnv;
}

export interface RuntimeHandle {
  child: SpawnHandle["child"];
  pid?: number;
  logPath: string;
  apiBase: string;
  readyPromise: Promise<void>;
}

export async function writeTtsConfig(opts: {
  repoDir: string;
  model: GptSovitsModel;
  device: ComputeDevice;
  isHalf: boolean;
}): Promise<string> {
  const configPath = `${opts.repoDir}/GPT_SoVITS/configs/tts_infer.yaml`;
  const selection = getModelSelection(opts.model);
  const yaml = composeTtsYaml({
    bertBasePath: selection.localBertDir,
    cnhuhbertBasePath: selection.localHubertDir,
    t2sWeights: selection.localT2sPath,
    vitsWeights: selection.localVitsPath,
    device: opts.device,
    isHalf: opts.isHalf,
    version: opts.model,
  });
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, yaml, "utf-8");
  audioLog.info(
    `tts_infer.yaml 已写入 (version=${opts.model}, device=${opts.device})`,
  );
  return configPath;
}

function composeTtsYaml(input: {
  bertBasePath: string;
  cnhuhbertBasePath: string;
  t2sWeights: string;
  vitsWeights: string;
  device: ComputeDevice;
  isHalf: boolean;
  version: GptSovitsModel;
}): string {
  const values: Record<string, string | number | boolean> = {
    bert_base_path: input.bertBasePath,
    cnhuhbert_base_path: input.cnhuhbertBasePath,
    t2s_weights_path: input.t2sWeights,
    vits_weights_path: input.vitsWeights,
    device: input.device,
    is_half: input.isHalf,
    version: input.version,
  };
  const renderSection = (): string =>
    Object.entries(values)
      .map(([k, v]) => `  ${k}: ${formatYaml(v)}`)
      .join("\n");
  return [
    `custom:`,
    renderSection(),
    `${input.version}:`,
    renderSection(),
    "",
  ].join("\n");
}

function formatYaml(v: string | number | boolean): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  return v;
}

export async function startRuntime(opts: StartOptions): Promise<RuntimeHandle> {
  const configPath = await writeTtsConfig({
    repoDir: opts.repoDir,
    model: opts.model,
    device: opts.device,
    isHalf: opts.isHalf,
  });

  await fs.promises.mkdir(path.dirname(opts.logPath), { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.extraEnv,
    PYTHONUNBUFFERED: "1",
    HF_ENDPOINT: opts.extraEnv?.HF_ENDPOINT ?? undefined,
  } as NodeJS.ProcessEnv;

  if (opts.device === "cuda") {
    env.CUDA_VISIBLE_DEVICES = env.CUDA_VISIBLE_DEVICES ?? "0";
  }
  if (opts.device === "mps") {
    env.PYTORCH_ENABLE_MPS_FALLBACK = env.PYTORCH_ENABLE_MPS_FALLBACK ?? "1";
  }

  audioLog.info(
    `正在启动 GPT-SoVITS server (${opts.host}:${opts.port}, device=${opts.device}, model=${opts.model}) ...`,
  );

  const args = [
    "api_v2.py",
    "-a",
    opts.host,
    "-p",
    String(opts.port),
    "-c",
    configPath,
  ];

  const readyKeyword = opts.readyKeyword ?? "Application startup complete";
  const startedAt = Date.now();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const handle = spawnDetached(opts.pythonBin, args, {
    cwd: opts.repoDir,
    env,
    onStdoutLine: (line) => {
      audioLog.debug(`[gpt-sovits] ${line}`);
      if (shouldResolveReady(line)) resolveReady();
    },
    onStderrLine: (line) => {
      routeStderr(line);
      if (shouldResolveReady(line)) resolveReady();
    },
    onExit: (code) => {
      if (code !== 0) {
        audioLog.error(`GPT-SoVITS server 已退出，code=${code}`);
        rejectReady(new Error(`GPT-SoVITS server 异常退出 code=${code}`));
      }
    },
  });

  function shouldResolveReady(line: string): boolean {
    return (
      line.includes(readyKeyword) && Date.now() - startedAt >= 500
    );
  }

  function routeStderr(line: string): void {
    const stripped = line.replace(/^\s*|\s*$/g, "");
    if (/^(ERROR|CRITICAL|FATAL|Traceback)/i.test(stripped)) {
      audioLog.error(`[gpt-sovits] ${line}`);
    } else if (/^WARN/i.test(stripped)) {
      audioLog.warn(`[gpt-sovits] ${line}`);
    } else {
      audioLog.info(`[gpt-sovits] ${line}`);
    }
  }

  return {
    child: handle.child,
    pid: handle.pid,
    logPath: opts.logPath,
    apiBase: `http://${opts.host}:${opts.port}`,
    readyPromise,
  };
}

export async function stopRuntime(handle: RuntimeHandle): Promise<void> {
  if (!handle || !handle.pid) return;
  audioLog.info("正在停止 GPT-SoVITS server ...");
  const exited = new Promise<void>((resolve) => {
    handle.child.once("exit", () => resolve());
    handle.child.once("error", () => resolve());
  });
  try {
    handle.child.kill("SIGTERM");
  } catch {}
  const timed = new Promise<void>((resolve) =>
    setTimeout(() => {
      try {
        handle.child.kill("SIGKILL");
      } catch {}
      resolve();
    }, 5_000),
  );
  await Promise.race([exited, timed]);
  audioLog.info("GPT-SoVITS server 已停止");
}

export function resolveLogPath(serviceDataDir: string): string {
  return path.join(serviceDataDir, RUNTIME_LOG_FILENAME);
}

export function resolveTempBase(): string {
  return path.join(process.cwd(), "temp", "audio");
}
