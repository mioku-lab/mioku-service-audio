import type { GenerateByTextOptions } from "../types";

export interface TtsRequestPayload {
  text: string;
  text_lang: string;
  ref_audio_path: string;
  prompt_text: string;
  prompt_lang: string;
  text_split_method: string;
  top_k: number;
  top_p: number;
  temperature: number;
  speed_factor: number;
  media_type: "wav" | "ogg" | "aac" | "raw";
  streaming_mode: boolean;
  parallel_infer: boolean;
  seed: number;
}

export interface InferenceResult {
  bytes: Uint8Array;
  contentType: string;
  durationMs: number;
}

export function buildTtsRequest(
  text: string,
  refAudioPath: string,
  promptText: string,
  promptLang: string,
  textLang: string,
  options: GenerateByTextOptions,
): TtsRequestPayload {
  return {
    text,
    text_lang: textLang.toLowerCase(),
    ref_audio_path: refAudioPath,
    prompt_text: promptText,
    prompt_lang: promptLang.toLowerCase(),
    text_split_method: options.textSplitMethod ?? "cut5",
    top_k: options.topK ?? 15,
    top_p: options.topP ?? 1,
    temperature: options.temperature ?? 1,
    speed_factor: options.speedFactor ?? 1.0,
    media_type: options.mediaType ?? "wav",
    streaming_mode: options.streaming ?? false,
    parallel_infer: options.parallelInfer ?? true,
    seed: options.seed ?? -1,
  };
}

export async function postInference(
  apiBase: string,
  payload: TtsRequestPayload,
  timeoutMs: number,
): Promise<InferenceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${apiBase}/tts`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`TTS 接口返回 ${response.status}: ${text}`);
    }
    const contentType = response.headers.get("content-type") ?? "audio/wav";
    const buf = new Uint8Array(await response.arrayBuffer());
    return {
      bytes: buf,
      contentType,
      durationMs: 0,
    };
  } catch (error: any) {
    clearTimeout(timer);
    throw error;
  }
}

export async function setSovitsWeights(
  apiBase: string,
  weightsPath: string,
): Promise<void> {
  const url = `${apiBase}/set_sovits_weights?weights_path=${encodeURIComponent(weightsPath)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`set_sovits_weights 失败 (${res.status}): ${text}`);
  }
}

export async function setGptWeights(
  apiBase: string,
  weightsPath: string,
): Promise<void> {
  const url = `${apiBase}/set_gpt_weights?weights_path=${encodeURIComponent(weightsPath)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`set_gpt_weights 失败 (${res.status}): ${text}`);
  }
}
