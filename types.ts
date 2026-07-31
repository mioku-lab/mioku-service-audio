import type {
  SUPPORTED_LANGS,
  SUPPORTED_MODELS,
  SUPPORTED_TEXT_SPLIT_METHODS,
} from "./constants";

export type GptSovitsModel = (typeof SUPPORTED_MODELS)[number];
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];
export type TextSplitMethod = (typeof SUPPORTED_TEXT_SPLIT_METHODS)[number];

export type ComputeDevice = "cuda" | "mps" | "cpu";

export interface AudioServiceSettings {
  model: GptSovitsModel;
  device: ComputeDevice | "auto";
  host: string;
  port: number;
  pythonVersion: string;
  pipIndexUrl: string;
  hfMirror: string;
  gitRemote: string;
  huggingfaceRepo: string;
  defaultLang: SupportedLang;
  defaultTextSplitMethod: TextSplitMethod;
  inferenceTimeoutMs: number;
  isHalf: boolean;
  autoBootstrap: boolean;
  defaultRefAudio: string;
}

export interface ReferenceAudioManifestEntry {
  name: string;
  fileName: string;
  promptText: string;
  lang: SupportedLang;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReferenceAudioManifest {
  schemaVersion: 1;
  entries: Record<string, ReferenceAudioManifestEntry>;
}

export interface GenerateByTextOptions {
  text: string;
  refAudioName?: string;
  refAudioPath?: string;
  promptText?: string;
  promptLang?: SupportedLang;
  textLang?: SupportedLang;
  textSplitMethod?: TextSplitMethod;
  speedFactor?: number;
  topK?: number;
  topP?: number;
  temperature?: number;
  seed?: number;
  streaming?: boolean;
  parallelInfer?: boolean;
  mediaType?: "wav" | "ogg" | "aac" | "raw";
  model?: GptSovitsModel;
  outputDir?: string;
  fileName?: string;
}

export interface GenerateByTextResult {
  filePath: string;
  fileName: string;
  modelUsed: GptSovitsModel;
  text: string;
  durationMs?: number;
  inferenceMs: number;
}

export interface AudioServiceStatus {
  ready: boolean;
  bootstrapping: boolean;
  device: ComputeDevice | null;
  model: GptSovitsModel;
  host: string;
  port: number;
  pid?: number;
  startedAt?: number;
  lastError?: string;
}

export interface AudioServiceApi {
  ready(): Promise<boolean>;
  getStatus(): AudioServiceStatus;
  generateByText(options: GenerateByTextOptions): Promise<GenerateByTextResult>;
  addReferenceAudio(input: {
    name: string;
    filePath: string;
    promptText: string;
    lang: SupportedLang;
  }): Promise<ReferenceAudioManifestEntry>;
  removeReferenceAudio(name: string): Promise<boolean>;
  listReferenceAudios(): Promise<ReferenceAudioManifestEntry[]>;
  getReferenceAudio(name: string): Promise<ReferenceAudioManifestEntry | null>;
  setActiveModel(model: GptSovitsModel): Promise<void>;
  getActiveModel(): GptSovitsModel;
  listSupportedModels(): GptSovitsModel[];
}

export interface BootstrapProgress {
  step: string;
  message: string;
}
