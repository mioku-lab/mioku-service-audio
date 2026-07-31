import type { SupportedLang } from "../types";

const RE_ZH = /[\u4e00-\u9fff]/;
const RE_JA = /[\u3040-\u30ff\u31f0-\u31ff]/;
const RE_KO = /[\uac00-\ud7af]/;
const RE_EN = /[A-Za-z]/;

export function detectLang(text: string, fallback: SupportedLang = "zh"): SupportedLang {
  if (!text) return fallback;
  const sample = text.slice(0, 400);
  const zh = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const ja = (sample.match(/[\u3040-\u30ff\u31f0-\u31ff]/g) || []).length;
  const ko = (sample.match(/[\uac00-\ud7af]/g) || []).length;
  const en = (sample.match(/[A-Za-z]/g) || []).length;
  const max = Math.max(zh, ja, ko, en);
  if (max === 0) return fallback;
  if (max === zh) return "zh";
  if (max === ja) return "ja";
  if (max === ko) return "ko";
  return "en";
}

export function isChinese(text: string): boolean {
  return RE_ZH.test(text);
}

export function isJapanese(text: string): boolean {
  return RE_JA.test(text);
}

export function isKorean(text: string): boolean {
  return RE_KO.test(text);
}

export function isEnglish(text: string): boolean {
  return RE_EN.test(text);
}
