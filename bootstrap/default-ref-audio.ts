import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { audioLog } from "../utils/log";
import {
  BUNDLED_REFERENCE_AUDIOS,
  REFERENCE_AUDIO_DIRNAME,
} from "../constants";
import type { ReferenceAudioStore } from "../runtime/reference-audio";

export async function ensureDefaultReferenceAudio(
  serviceDataDir: string,
  store: ReferenceAudioStore,
): Promise<void> {
  const audioDir = path.join(serviceDataDir, REFERENCE_AUDIO_DIRNAME);
  await mkdir(audioDir, { recursive: true });
  await store.ensureReady();

  for (const entry of BUNDLED_REFERENCE_AUDIOS) {
    await registerOne(store, audioDir, entry);
  }
}

async function registerOne(
  store: ReferenceAudioStore,
  audioDir: string,
  entry: (typeof BUNDLED_REFERENCE_AUDIOS)[number],
): Promise<void> {
  const assetPath = resolveBundledAsset(entry.filename);
  const targetPath = path.join(audioDir, entry.filename);

  const existing = await store.get(entry.name);
  const hasFile = existsSync(targetPath);

  if (existing && hasFile) {
    return;
  }

  if (!existsSync(assetPath)) {
    audioLog.warn(`未找到内置参考音频资源 ${assetPath}"`);
    return;
  }

  if (!hasFile) {
    await copyFile(assetPath, targetPath);
    audioLog.info(`已复制内置参考音频 -> ${targetPath}`);
  }

  await store.add({
    name: entry.name,
    sourceFile: assetPath,
    promptText: entry.promptText,
    lang: entry.lang,
  });
  audioLog.info(`内置参考音频已注册: ${entry.name} (lang=${entry.lang})`);
}

function resolveBundledAsset(filename: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "assets", filename);
}
