import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { audioLog } from "../utils/log";

const PATCH_MARKER_FILENAME = ".source-patched";
const PATCH_TARGET_REL_PATH = path.join(
  "GPT_SoVITS",
  "TTS_infer_pack",
  "TTS.py",
);
const OLD_DURATION_GUARD = "> 160000";
const NEW_DURATION_GUARD = "> 320000";

export async function ensureSourcePatch(
  repoDir: string,
  serviceDataDir: string,
): Promise<void> {
  const markerPath = path.join(serviceDataDir, PATCH_MARKER_FILENAME);
  if (existsSync(markerPath)) {
    return;
  }

  const targetPath = path.join(repoDir, PATCH_TARGET_REL_PATH);
  if (!existsSync(targetPath)) {
    audioLog.warn(`源码补丁目标文件不存在，跳过: ${targetPath}`);
    return;
  }

  const original = await fs.readFile(targetPath, "utf-8");

  if (original.includes(NEW_DURATION_GUARD) && !original.includes(OLD_DURATION_GUARD)) {
    await fs.writeFile(markerPath, new Date().toISOString(), "utf-8");
    return;
  }

  if (!original.includes(OLD_DURATION_GUARD)) {
    audioLog.warn(
      `未在 ${PATCH_TARGET_REL_PATH} 找到锚点 "${OLD_DURATION_GUARD}"，GPT-SoVITS 源码可能已变更，跳过 monkey patch`,
    );
    return;
  }

  const patched = original.split(OLD_DURATION_GUARD).join(NEW_DURATION_GUARD);
  await fs.writeFile(targetPath, patched, "utf-8");
  await fs.writeFile(markerPath, new Date().toISOString(), "utf-8");
  audioLog.info(
    `已对 GPT-SoVITS 源码打猴子补丁: 参考音频时长上限 10s -> 20s (锚点 ${OLD_DURATION_GUARD} -> ${NEW_DURATION_GUARD})`,
  );
}
