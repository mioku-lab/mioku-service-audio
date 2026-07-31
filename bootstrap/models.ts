import * as path from "node:path";
import * as fs from "node:fs/promises";
import { audioLog } from "../utils/log";
import { pathExists } from "../utils/fs";
import { runCommand } from "mioku";
import type { GptSovitsModel } from "../types";
import { HUGGINGFACE_REPO, G2PW_REPO } from "../constants";

export interface ModelSelection {
  localBertDir: string;
  localHubertDir: string;
  localModelDir: string;
  localT2sPath: string;
  localVitsPath: string;
  remoteT2sFile: string;
  remoteVitsFile: string;
  remoteModelDir: string;
  version: GptSovitsModel;
  needsG2PW: boolean;
}

function buildModelSelection(opts: {
  remoteModelDir: string;
  remoteT2sFile: string;
  remoteVitsFile: string;
  needsG2PW: boolean;
  version: GptSovitsModel;
}): ModelSelection {
  const pretrainedModelsRoot = "GPT_SoVITS/pretrained_models";
  return {
    localBertDir: `${pretrainedModelsRoot}/chinese-roberta-wwm-ext-large`,
    localHubertDir: `${pretrainedModelsRoot}/chinese-hubert-base`,
    localModelDir: `${pretrainedModelsRoot}/${opts.remoteModelDir}`,
    localT2sPath: `${pretrainedModelsRoot}/${opts.remoteT2sFile}`,
    localVitsPath: `${pretrainedModelsRoot}/${opts.remoteVitsFile}`,
    remoteT2sFile: opts.remoteT2sFile,
    remoteVitsFile: opts.remoteVitsFile,
    remoteModelDir: opts.remoteModelDir,
    version: opts.version,
    needsG2PW: opts.needsG2PW,
  };
}

const MODEL_PRESETS: Record<GptSovitsModel, ModelSelection> = {
  v2: buildModelSelection({
    remoteModelDir: "gsv-v2final-pretrained",
    remoteT2sFile: "gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt",
    remoteVitsFile: "gsv-v2final-pretrained/s2G2333k.pth",
    needsG2PW: true,
    version: "v2",
  }),
  v2Pro: buildModelSelection({
    remoteModelDir: "v2Pro",
    remoteT2sFile: "s1v3.ckpt",
    remoteVitsFile: "v2Pro/s2Gv2Pro.pth",
    needsG2PW: false,
    version: "v2Pro",
  }),
  v2ProPlus: buildModelSelection({
    remoteModelDir: "v2Pro",
    remoteT2sFile: "s1v3.ckpt",
    remoteVitsFile: "v2Pro/s2Gv2ProPlus.pth",
    needsG2PW: false,
    version: "v2ProPlus",
  }),
  v4: buildModelSelection({
    remoteModelDir: "gsv-v4-pretrained",
    remoteT2sFile: "s1v3.ckpt",
    remoteVitsFile: "gsv-v4-pretrained/s2Gv4.pth",
    needsG2PW: false,
    version: "v4",
  }),
};

export function getModelSelection(model: GptSovitsModel): ModelSelection {
  return MODEL_PRESETS[model];
}

export function listModelSelections(): ModelSelection[] {
  return Object.values(MODEL_PRESETS);
}

const CHINESE_ROBERTA_FILES = [
  "config.json",
  "pytorch_model.bin",
  "tokenizer.json",
];

const CHINESE_HUBERT_FILES = [
  "config.json",
  "pytorch_model.bin",
  "preprocessor_config.json",
];

function isSuccessCode(code: number | string | null): boolean {
  return code === 0 || code === null;
}

async function curlDownload(url: string, localPath: string): Promise<boolean> {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const res = await runCommand("curl", [
    "-L",
    "--fail",
    "--retry",
    "3",
    "--connect-timeout",
    "60",
    "-o",
    localPath,
    url,
  ]);
  if (isSuccessCode(res.code)) return true;
  await fs.unlink(localPath).catch(() => {});
  return false;
}

async function downloadDirectoryFiles(opts: {
  hfMirror: string;
  repo: string;
  remoteDir: string;
  localDir: string;
  filesToTry: string[];
  label: string;
}): Promise<void> {
  for (const fileName of opts.filesToTry) {
    const localPath = path.join(opts.localDir, fileName);
    if (await isUsableFile(localPath)) continue;
    const url = `${opts.hfMirror}/${opts.repo}/resolve/main/${opts.remoteDir}/${fileName}`;
    const ok = await curlDownload(url, localPath);
    if (ok) {
      audioLog.info(`下载: ${opts.label}/${fileName}`);
      continue;
    }
    audioLog.debug(`跳过 (远端不存在): ${fileName}`);
  }
}

async function downloadSingleFile(
  hfMirror: string,
  repo: string,
  remotePath: string,
  localPath: string,
  label: string,
): Promise<void> {
  if (await isUsableFile(localPath)) return;
  const url = `${hfMirror}/${repo}/resolve/main/${remotePath}`;
  audioLog.info(`下载: ${label}`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const ok = await curlDownload(url, localPath);
  if (!ok) {
    throw new Error(`下载失败: ${url}`);
  }
}

async function isUsableFile(localPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(localPath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function ensureBasePretrained(
  repoDir: string,
  hfMirror: string,
): Promise<void> {
  const localRoot = `${repoDir}/GPT_SoVITS/pretrained_models`;

  await downloadDirectoryFiles({
    hfMirror,
    repo: HUGGINGFACE_REPO,
    remoteDir: "chinese-roberta-wwm-ext-large",
    localDir: `${localRoot}/chinese-roberta-wwm-ext-large`,
    filesToTry: CHINESE_ROBERTA_FILES,
    label: "chinese-roberta-wwm-ext-large",
  });

  await downloadDirectoryFiles({
    hfMirror,
    repo: HUGGINGFACE_REPO,
    remoteDir: "chinese-hubert-base",
    localDir: `${localRoot}/chinese-hubert-base`,
    filesToTry: CHINESE_HUBERT_FILES,
    label: "chinese-hubert-base",
  });
}

export async function ensureModelWeights(
  repoDir: string,
  model: GptSovitsModel,
  hfMirror: string,
): Promise<void> {
  const selection = getModelSelection(model);
  const localRoot = `${repoDir}/GPT_SoVITS/pretrained_models`;

  audioLog.debug(`正在准备 ${model} 权重 (目录 ${selection.remoteModelDir}/) ...`);
  const modelDir = `${localRoot}/${selection.remoteModelDir}`;
  await fs.mkdir(modelDir, { recursive: true });
  if (selection.remoteModelDir !== ".") {
    await downloadDirectoryFiles({
      hfMirror,
      repo: HUGGINGFACE_REPO,
      remoteDir: selection.remoteModelDir,
      localDir: modelDir,
      filesToTry: ["config.json"],
      label: `${selection.remoteModelDir}/config.json (optional)`,
    });
  }

  await downloadSingleFile(
    hfMirror,
    HUGGINGFACE_REPO,
    selection.remoteT2sFile,
    `${localRoot}/${selection.remoteT2sFile}`,
    `${model} t2s: ${path.basename(selection.remoteT2sFile)}`,
  );

  await downloadSingleFile(
    hfMirror,
    HUGGINGFACE_REPO,
    selection.remoteVitsFile,
    `${localRoot}/${selection.remoteVitsFile}`,
    `${model} vits: ${path.basename(selection.remoteVitsFile)}`,
  );
}

export async function ensureG2PWModel(
  repoDir: string,
  hfMirror: string,
): Promise<void> {
  const target = `${repoDir}/GPT_SoVITS/text`;
  const marker = `${target}/G2PWModel`;
  if (await pathExists(marker)) {
    audioLog.info(`G2PW 模型已存在: ${marker}`);
    return;
  }
  audioLog.info(`正在下载 G2PW 模型 ...`);
  await fs.mkdir(target, { recursive: true });
  const zipPath = `${target}/G2PWModel.zip`;
  await downloadSingleFile(
    hfMirror,
    G2PW_REPO,
    "G2PWModel.zip",
    zipPath,
    "G2PWModel.zip",
  );
  audioLog.info(`正在解压 G2PWModel.zip ...`);
  const ok = await unzipArchive(zipPath, target);
  if (!ok) {
    throw new Error(`解压 G2PWModel.zip 失败: ${zipPath}`);
  }
  await fs.unlink(zipPath).catch(() => {});
}

async function unzipArchive(zipPath: string, destDir: string): Promise<boolean> {
  const linux = await runCommand("unzip", ["-o", zipPath, "-d", destDir]);
  if (isSuccessCode(linux.code)) return true;
  if (process.platform === "win32") {
    const ps = await runCommand(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`,
      ],
    );
    if (isSuccessCode(ps.code)) return true;
  }
  audioLog.error(
    `unzip 失败: linux=${linux.stderr.trim() || linux.stdout.trim()}`,
  );
  return false;
}