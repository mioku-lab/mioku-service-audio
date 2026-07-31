import { audioLog } from "../utils/log";
import { pathExists } from "../utils/fs";
import { runCommand } from "mioku";
import type { GptSovitsModel } from "../types";
import { HUGGINGFACE_REPO, G2PW_REPO } from "../constants";

export interface ModelSelection {
  pretrainedDir: string;
  bertBasePath: string;
  cnhuhbertBasePath: string;
  t2sWeights: string;
  vitsWeights: string;
  version: GptSovitsModel | "v3";
  needsG2PW: boolean;
}

const MODEL_PRESETS: Record<GptSovitsModel, ModelSelection> = {
  v2: {
    pretrainedDir: "GPT_SoVITS/pretrained_models/gsv-v2final-pretrained",
    bertBasePath: "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    cnhuhbertBasePath: "GPT_SoVITS/pretrained_models/chinese-hubert-base",
    t2sWeights: "GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt",
    vitsWeights: "GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2G2333k.pth",
    version: "v2",
    needsG2PW: true,
  },
  v2Pro: {
    pretrainedDir: "GPT_SoVITS/pretrained_models/v2Pro",
    bertBasePath: "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    cnhuhbertBasePath: "GPT_SoVITS/pretrained_models/chinese-hubert-base",
    t2sWeights: "GPT_SoVITS/pretrained_models/s1v3.ckpt",
    vitsWeights: "GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth",
    version: "v2Pro",
    needsG2PW: false,
  },
  v2ProPlus: {
    pretrainedDir: "GPT_SoVITS/pretrained_models/v2Pro",
    bertBasePath: "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    cnhuhbertBasePath: "GPT_SoVITS/pretrained_models/chinese-hubert-base",
    t2sWeights: "GPT_SoVITS/pretrained_models/s1v3.ckpt",
    vitsWeights: "GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth",
    version: "v2ProPlus",
    needsG2PW: false,
  },
  v4: {
    pretrainedDir: "GPT_SoVITS/pretrained_models/gsv-v4-pretrained",
    bertBasePath: "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    cnhuhbertBasePath: "GPT_SoVITS/pretrained_models/chinese-hubert-base",
    t2sWeights: "GPT_SoVITS/pretrained_models/s1v3.ckpt",
    vitsWeights: "GPT_SoVITS/pretrained_models/gsv-v4-pretrained/s2Gv4.pth",
    version: "v4",
    needsG2PW: false,
  },
};

export function getModelSelection(model: GptSovitsModel): ModelSelection {
  return MODEL_PRESETS[model];
}

export function listModelSelections(): ModelSelection[] {
  return Object.values(MODEL_PRESETS);
}

export async function ensureBasePretrained(repoDir: string): Promise<void> {
  const targets = [
    "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large",
    "GPT_SoVITS/pretrained_models/chinese-hubert-base",
  ];
  for (const rel of targets) {
    const fullPath = `${repoDir}/${rel}`;
    if (await pathExists(fullPath)) continue;
    audioLog.info(`正在下载基础预训练: ${rel} ...`);
    await downloadFolder(`${HUGGINGFACE_REPO}/${rel}`, fullPath);
  }
}

export async function ensureG2PWModel(repoDir: string): Promise<void> {
  const target = `${repoDir}/GPT_SoVITS/text`;
  const marker = `${target}/G2PWModel`;
  if (await pathExists(marker)) {
    audioLog.info(`G2PW 模型已存在: ${marker}`);
    return;
  }
  audioLog.info(`正在下载 G2PW 模型 ...`);
  const tmp = `${repoDir}/GPT_SoVITS/text/_G2PWModel.zip`;
  await ensureDir(target);
  const download = await runCommand("huggingface-cli", [
    "download",
    `${G2PW_REPO}/G2PWModel.zip`,
    "--local-dir",
    `${repoDir}/GPT_SoVITS/text`,
    "--local-dir-use-symlinks",
    "False",
    "--repo-type",
    "model",
  ]);
  if (download.code !== 0) {
    audioLog.warn(
      `huggingface-cli 下载 G2PW 失败，尝试 curl fallback ...`,
    );
    throw new Error("G2PW 下载失败，请手动下载并放入 GPT_SoVITS/text/");
  }
  const zip = `${repoDir}/GPT_SoVITS/text/G2PWModel.zip`;
  if (await pathExists(zip)) {
    await unzip(zip, target);
    await rm(zip);
  }
}

export async function ensureModelWeights(
  repoDir: string,
  model: GptSovitsModel,
  hfMirror: string,
): Promise<void> {
  const selection = getModelSelection(model);

  for (const rel of [selection.t2sWeights, selection.vitsWeights]) {
    const fullPath = `${repoDir}/${rel}`;
    if (await pathExists(fullPath)) continue;
    const fileName = rel.split("/").pop()!;
    audioLog.info(`正在下载 ${model} 模型权重: ${fileName} ...`);
    await downloadFile(
      `${HUGGINGFACE_REPO}/${rel.replace(/^GPT_SoVITS\/pretrained_models\//, "")}`,
      fullPath,
      hfMirror,
    );
  }
}

async function downloadFolder(
  sourcePath: string,
  localDir: string,
): Promise<void> {
  await ensureDir(localDir);
  const download = await runCommand("huggingface-cli", [
    "download",
    sourcePath,
    "--local-dir",
    localDir,
    "--local-dir-use-symlinks",
    "False",
    "--repo-type",
    "model",
  ]);
  if (download.code === 0) return;
  audioLog.warn(
    `huggingface-cli 下载 ${sourcePath} 失败 (返回 ${download.code})，尝试 hf-transfer`,
  );
  const transfer = await runCommand("huggingface-cli", [
    "download",
    sourcePath,
    "--local-dir",
    localDir,
    "--repo-type",
    "model",
  ]);
  if (transfer.code !== 0) {
    throw new Error(
      `下载预训练目录 ${sourcePath} 失败 (code=${transfer.code})`,
    );
  }
}

async function downloadFile(
  sourcePath: string,
  destPath: string,
  hfMirror: string,
): Promise<void> {
  await ensureDir(destPath.substring(0, destPath.lastIndexOf("/")));
  const url = `${hfMirror}/${sourcePath}`;
  audioLog.info(`下载: ${url} -> ${destPath}`);
  const res = await runCommand("curl", [
    "-L",
    "--retry",
    "3",
    "--connect-timeout",
    "15",
    "-o",
    destPath,
    url,
  ]);
  if (res.code !== 0) {
    throw new Error(
      `下载 ${url} 失败: ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
}

async function ensureDir(target: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(target, { recursive: true });
}

async function unzip(zipPath: string, destDir: string): Promise<void> {
  const res = await runCommand("unzip", ["-o", zipPath, "-d", destDir]);
  if (res.code !== 0) {
    throw new Error(
      `解压 ${zipPath} 失败: ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
}

async function rm(target: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rm(target, { force: true });
}
