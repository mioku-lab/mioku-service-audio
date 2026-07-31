export const SERVICE_NAME = "audio" as const;

export const REPO_DIRNAME = "GPT-SoVITS";
export const VENV_DIRNAME = "venv";
export const REFERENCE_AUDIO_DIRNAME = "reference-audio";
export const PRETRAINED_DIRNAME = "GPT_SoVITS/pretrained_models";
export const G2PW_TARGET_DIRNAME = "GPT_SoVITS/text/G2PWModel";
export const RUNTIME_LOG_FILENAME = "runtime.log";

export const GPT_SOVITS_REPO_URL = "https://gh-proxy.com/https://github.com/RVC-Boss/GPT-SoVITS.git";
export const HUGGINGFACE_REPO = "lj1995/GPT-SoVITS";
export const G2PW_REPO = "XXXXRT/GPT-SoVITS-Pretrained";

export const DEFAULT_PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple";
export const DEFAULT_HF_MIRROR = "https://hf-mirror.com";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 9881;

export const SUPPORTED_MODELS = ["v2", "v2Pro", "v2ProPlus", "v4"] as const;
export const SUPPORTED_LANGS = ["zh", "en", "ja", "ko", "yue"] as const;
export const SUPPORTED_TEXT_SPLIT_METHODS = [
  "cut0",
  "cut1",
  "cut2",
  "cut3",
  "cut4",
  "cut5",
  "english_cut1",
  "english_cut2",
  "japan_cut1",
  "japan_cut2",
  "japan_cut3",
  "korean_cut1",
  "yue_cut1",
  "auto",
] as const;

export const REQUIRED_DISK_GB = 8;
export const MIN_RAM_GB = 8;
export const BOOTSTRAP_READY_TIMEOUT_MS = 600_000;
export const RUNTIME_STARTUP_TIMEOUT_MS = 120_000;

export const VENV_PY_MIN = [3, 10] as const;
export const VENV_PY_MAX_EXCLUSIVE = [3, 13] as const;

export const SUPPORTED_PY_VERSIONS = [
  "3.10",
  "3.11",
  "3.12",
] as const;
