import { audioLog } from "../utils/log";
import { pathExists } from "../utils/fs";
import { runCommand } from "mioku";
import type { PythonInfo } from "./python";

export interface VenvInfo {
  dir: string;
  pythonBin: string;
  pipBin: string;
}

function venvPython(venvDir: string): string {
  if (process.platform === "win32") {
    return `${venvDir}\\Scripts\\python.exe`;
  }
  return `${venvDir}/bin/python3`;
}

function venvPip(venvDir: string): string {
  if (process.platform === "win32") {
    return `${venvDir}\\Scripts\\pip.exe`;
  }
  return `${venvDir}/bin/pip`;
}

export async function createVenv(
  venvDir: string,
  pythonInfo: PythonInfo,
  pipIndexUrl: string,
): Promise<VenvInfo> {
  const exists = await pathExists(venvDir);
  if (!exists) {
    audioLog.info(`正在创建虚拟环境 ${venvDir} ...`);
    const res = await runCommand(pythonInfo.command, ["-m", "venv", venvDir]);
    if (res.code !== 0) {
      throw new Error(
        `创建虚拟环境失败: ${res.stderr.trim() || res.stdout.trim()}`,
      );
    }
  }
  const pythonBin = venvPython(venvDir);
  const pipBin = venvPip(venvDir);

  await ensurePip(pythonBin);
  await writePipConfig(venvDir, pipIndexUrl);
  await setTrustedHost(venvDir);

  const probe = await runCommand(pythonBin, ["--version"]);
  if (probe.code !== 0) {
    throw new Error(
      `虚拟环境 Python 不可用: ${probe.stderr.trim() || probe.stdout.trim()}`,
    );
  }
  audioLog.info(
    `虚拟环境就绪: ${pythonBin} (${probe.stdout.trim() || probe.stderr.trim()})`,
  );
  return { dir: venvDir, pythonBin, pipBin };
}

async function ensurePip(pythonBin: string): Promise<void> {
  const probe = await runCommand(pythonBin, ["-m", "pip", "--version"]);
  if (probe.code === 0) return;
  audioLog.warn("venv 中未检测到 pip，尝试 ensurepip ...");
  const ensure = await runCommand(pythonBin, ["-m", "ensurepip", "--upgrade"]);
  if (ensure.code !== 0) {
    throw new Error(
      `虚拟环境内 pip 引导失败: ${ensure.stderr.trim() || ensure.stdout.trim()}`,
    );
  }
}

function pipConfigPath(venvDir: string): string {
  if (process.platform === "win32") {
    return `${venvDir}\\pip.ini`;
  }
  return `${venvDir}/pip.conf`;
}

async function writePipConfig(
  venvDir: string,
  indexUrl: string,
): Promise<void> {
  if (!indexUrl) return;
  const configPath = pipConfigPath(venvDir);
  const body = [
    "[global]",
    `index-url = ${indexUrl}`,
    "trusted-host = pypi.tuna.tsinghua.edu.cn",
    "",
  ].join("\n");
  const fs = await import("node:fs/promises");
  await fs.writeFile(configPath, body, "utf-8");
  audioLog.info(`已设置 pip 索引: ${indexUrl}`);
}

async function setTrustedHost(venvDir: string): Promise<void> {
  if (process.platform === "win32") return;
  const fs = await import("node:fs/promises");
  const target = `${venvDir}/pyvenv.cfg`;
  try {
    const raw = await fs.readFile(target, "utf-8");
    const lines = raw.split(/\r?\n/);
    if (!lines.some((l) => l.startsWith("include-system-site-packages"))) {
      await fs.appendFile(target, "include-system-site-packages = false\n");
    }
  } catch {
  }
}
