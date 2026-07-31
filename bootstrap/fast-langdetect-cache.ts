import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { audioLog } from "../utils/log";

const CACHE_REL_PATH = path.join(
  "GPT_SoVITS",
  "pretrained_models",
  "fast_langdetect",
);

export async function ensureFastLangdetectCache(repoDir: string): Promise<void> {
  const cacheDir = path.join(repoDir, CACHE_REL_PATH);
  await mkdir(cacheDir, { recursive: true });
  audioLog.debug(`fast_langdetect 缓存目录就绪: ${cacheDir}`);
}
