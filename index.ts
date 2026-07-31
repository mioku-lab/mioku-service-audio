import { logger } from "mioki";
import {
  getServiceDataDir,
  ensureDataDir,
  registerServiceConfig,
  getServiceConfig,
} from "mioku";
import type { MiokuService } from "mioku";
import { SETTINGS_DEFAULTS } from "./config";
import { createAudioService } from "./runtime/service";
import type { AudioServiceApi, AudioServiceSettings } from "./types";
import { SERVICE_NAME } from "./constants";
import type { BootstrapState, BootstrapPhase } from "./bootstrap";

interface BootOptions {
  configPluginName?: string;
}

export const AudioService = {
  name: SERVICE_NAME,
  version: "1.0.0",
};

export type {
  AudioServiceApi,
  AudioServiceSettings,
  AudioServiceStatus,
  GenerateByTextOptions,
  GenerateByTextResult,
  ReferenceAudioManifestEntry,
  SupportedLang,
  TextSplitMethod,
  GptSovitsModel,
  ComputeDevice,
} from "./types";

export type { BootstrapPhase, BootstrapState } from "./bootstrap";

let cachedService: AudioServiceApi | null = null;
let cachedImpl: ReturnType<typeof createAudioService> | null = null;
let cachedDir: string | null = null;

async function bootstrapAudioService(): Promise<AudioServiceApi> {
  const serviceDataDir = ensureDataDir(SERVICE_NAME);
  await registerServiceConfig(
    SERVICE_NAME,
    "settings",
    SETTINGS_DEFAULTS as unknown as Record<string, unknown>,
  );
  const stored = await getServiceConfig(SERVICE_NAME, "settings");
  const settings: AudioServiceSettings = {
    ...SETTINGS_DEFAULTS,
    ...(stored as Partial<AudioServiceSettings>),
  };
  const impl = createAudioService({
    initialSettings: settings,
    serviceDataDir,
  });
  cachedImpl = impl;
  cachedDir = serviceDataDir;
  const api = impl as unknown as AudioServiceApi & {
    start: () => void;
    onBootstrapState: (listener: (s: BootstrapState) => void) => () => void;
  };
  api.onBootstrapState?.((state) => {
    if (state.phase === "error") {
      logger.error(`[audio] ${state.message}`);
    } else if (state.ready) {
      logger.info(`[audio] ${state.message}`);
    } else {
      logger.debug?.(`[audio] ${state.message}`);
    }
  });
  api.start?.();
  cachedService = api as unknown as AudioServiceApi;
  return cachedService;
}

const audioService: MiokuService = {
  name: SERVICE_NAME,
  version: "1.0.0",
  description: "基于 GPT-SoVITS 的语音合成服务",
  api: {} as AudioServiceApi,

  async init() {
    this.api = await bootstrapAudioService();
  },

  async dispose() {
    cachedService = null;
    logger.info("audio-service 已卸载");
  },
};

export const audioMiokuService = audioService;
export default audioService;
