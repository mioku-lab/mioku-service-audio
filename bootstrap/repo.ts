import { audioLog } from "../utils/log";
import { runCommand, commandExists } from "mioku";

export interface CloneOptions {
  repoDir: string;
  remote: string;
}

export async function ensureGitAvailable(): Promise<void> {
  if (commandExists("git")) return;
  throw new Error("未检测到 git 命令，请先安装 git");
}

export async function ensureRepoCloned(options: CloneOptions): Promise<void> {
  const { repoDir, remote } = options;
  const fs = await import("node:fs/promises");
  if (await directoryHasGit(repoDir)) {
    audioLog.info(`GPT-SoVITS 仓库已存在: ${repoDir}`);
    return;
  }
  if (await pathExists(repoDir)) {
    await fs.rm(repoDir, { recursive: true, force: true });
  }

  audioLog.info(`正在克隆 GPT-SoVITS (代理: ${remote}) ...`);
  const res = await runCommand("git", [
    "clone",
    "--depth=1",
    "--single-branch",
    remote,
    repoDir,
  ]);
  if (res.code !== 0) {
    throw new Error(
      `git clone 失败: ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
  audioLog.info(`GPT-SoVITS 仓库就绪: ${repoDir}`);
}

async function directoryHasGit(dir: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(`${dir}/.git`);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(target: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function isRepoReady(repoDir: string): boolean {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    return fs.existsSync(`${repoDir}/api_v2.py`);
  } catch {
    return false;
  }
}
