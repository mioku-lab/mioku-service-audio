import type { AudioServiceSettings } from "./types";
import {
  DEFAULT_HF_MIRROR,
  DEFAULT_HOST,
  DEFAULT_PIP_INDEX_URL,
  DEFAULT_PORT,
  GPT_SOVITS_REPO_URL,
  HUGGINGFACE_REPO,
} from "./constants";

export const SETTINGS_DEFAULTS: AudioServiceSettings = {
  model: "v2",
  device: "auto",
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  pythonVersion: "3.10",
  pipIndexUrl: DEFAULT_PIP_INDEX_URL,
  hfMirror: DEFAULT_HF_MIRROR,
  gitRemote: GPT_SOVITS_REPO_URL,
  huggingfaceRepo: HUGGINGFACE_REPO,
  defaultLang: "zh",
  defaultTextSplitMethod: "cut5",
  inferenceTimeoutMs: 120_000,
  isHalf: true,
  autoBootstrap: true,
  defaultRefAudio: "",
};

export const REFERENCE_AUDIO_MANIFEST_FILENAME = "reference-audio.json";

export const REFERENCE_AUDIO_SCHEMA_VERSION = 1 as const;

export const REFERENCE_AUDIO_MANIFEST_DEFAULTS = {
  schemaVersion: REFERENCE_AUDIO_SCHEMA_VERSION,
  entries: {},
};
