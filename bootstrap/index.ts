import * as path from "node:path";
import { audioLog } from "../utils/log";
import { freePort } from "../utils/port";
import { probeDevice, inferHalfPrecision, type DeviceProbe } from "./device";
import { selectPython, ensurePip, type PythonInfo } from "./python";
import { createVenv, type VenvInfo } from "./venv";
import { ensureRepoCloned, ensureGitAvailable, isRepoReady } from "./repo";
import {
  ensureModelWeights,
  ensureBasePretrained,
  ensureG2PWModel,
} from "./models";
import { ensurePythonDeps, ensureTorchCodec, ensureNltkData } from "./deps";
import { ensureFastLangdetectCache } from "./fast-langdetect-cache";
import { ensureSourcePatch } from "./source-patch";
import { startRuntime, type RuntimeHandle } from "./runtime";
import {
  REPO_DIRNAME,
  VENV_DIRNAME,
  BOOTSTRAP_READY_TIMEOUT_MS,
  RUNTIME_STARTUP_TIMEOUT_MS,
} from "../constants";
import type {
  AudioServiceSettings,
  ComputeDevice,
  GptSovitsModel,
} from "../types";

export interface BootstrapContext {
  settings: AudioServiceSettings;
  serviceDataDir: string;
  listener?: (state: BootstrapState) => void;
}

export interface BootstrapState {
  phase: BootstrapPhase;
  message: string;
  ready: boolean;
  failed?: { phase: BootstrapPhase; reason: string };
}

export type BootstrapPhase =
  | "init"
  | "device"
  | "python"
  | "venv"
  | "repo"
  | "models"
  | "deps"
  | "config"
  | "runtime"
  | "ready"
  | "error";

export interface BootstrapResult {
  device: DeviceProbe;
  python: PythonInfo;
  venv: VenvInfo;
  runtime: RuntimeHandle;
  model: GptSovitsModel;
}

export async function bootstrapInBackground(
  ctx: BootstrapContext,
): Promise<BootstrapResult> {
  const { settings, serviceDataDir } = ctx;
  const update = (phase: BootstrapPhase, message: string, ready = false) => {
    ctx.listener?.({ phase, message, ready });
    if (phase === "error") {
      audioLog.error(message);
    } else {
      audioLog.info(message);
    }
  };

  let device: DeviceProbe;
  try {
    update("device", "正在检测运行设备 (NVIDIA / Apple Silicon / CPU)...");
    device = await probeDevice();
  } catch (reason: any) {
    update("error", `设备检测失败: ${reason?.message ?? reason}`);
    throw reason;
  }

  update("python", "正在选择系统 Python ...");
  const python = await selectPython(settings.pythonVersion);
  await ensurePip(python.command);

  const repoDir = path.join(serviceDataDir, REPO_DIRNAME);
  const venvDir = path.join(serviceDataDir, VENV_DIRNAME);

update("venv", "正在创建 Python 虚拟环境 ...");
  const venv = await createVenv(venvDir, python, settings.pipIndexUrl);

  update("repo", "正在拉取 GPT-SoVITS 仓库 ...");
  await ensureGitAvailable();
  await ensureRepoCloned({ repoDir, remote: settings.gitRemote });
  await ensureSourcePatch(repoDir, serviceDataDir);
  await ensureFastLangdetectCache(repoDir);

  update("models", "正在准备预训练模型 ...");
  await ensureBasePretrained(repoDir, settings.hfMirror);
  await ensureModelWeights(repoDir, settings.model, settings.hfMirror);
  if (await shouldInstallG2PW(settings.model)) {
    update("models", "正在准备 G2PW 模型 ...");
    await ensureG2PWModel(repoDir, settings.hfMirror);
  }

  update("deps", "正在安装 Python 依赖 (可能耗时 5-15 分钟)...");
  await ensurePythonDeps(venv, repoDir);

  update("deps", "正在确保 torchcodec 已安装 (torchaudio 2.9+ 必需)...");
  await ensureTorchCodec(venv);

  update("deps", "正在确保 NLTK 分词资源已就绪 ...");
  await ensureNltkData(venv);

  update("runtime", "正在检查端口占用 ...");
  await freePort(settings.port);

  update("runtime", "正在启动 GPT-SoVITS server ...");
  if (!isRepoReady(repoDir)) {
    throw new Error(`仓库不完整: ${repoDir}`);
  }
  const finalDevice =
    settings.device === "auto" ? device.device : settings.device;
  const isHalf =
    settings.isHalf &&
    inferHalfPrecision(finalDevice) &&
    finalDevice === "cuda";

  const logPath = path.join(serviceDataDir, "runtime.log");

  const runtime = await startRuntime({
    repoDir,
    pythonBin: venv.pythonBin,
    host: settings.host,
    port: settings.port,
    model: settings.model,
    device: finalDevice,
    isHalf,
    logPath,
    readyTimeoutMs: RUNTIME_STARTUP_TIMEOUT_MS,
    extraEnv: { HF_ENDPOINT: settings.hfMirror },
  });

  await Promise.race([
    runtime.readyPromise,
    timeoutReject(
      RUNTIME_STARTUP_TIMEOUT_MS,
      "GPT-SoVITS server 启动超时",
    ).catch((err) => {
      throw err;
    }),
  ]);

  update(
    "ready",
    `GPT-SoVITS 服务就绪 (端口 ${settings.port}, 设备 ${finalDevice})`,
    true,
  );
  return {
    device,
    python,
    venv,
    runtime,
    model: settings.model,
  };
}

function getModelSelectionName(model: GptSovitsModel): string {
  switch (model) {
    case "v2":
      return "gsv-v2final-pretrained";
    case "v2Pro":
    case "v2ProPlus":
      return "v2Pro";
    case "v4":
      return "gsv-v4-pretrained";
  }
}

async function shouldInstallG2PW(model: GptSovitsModel): Promise<boolean> {
  return model === "v2";
}

async function timeoutReject(ms: number, message: string): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export function boundBootstrapTimeout(): number {
  return BOOTSTRAP_READY_TIMEOUT_MS;
}
