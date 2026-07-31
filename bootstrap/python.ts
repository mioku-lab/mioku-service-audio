import { execFile } from "node:child_process";
import * as os from "node:os";
import { audioLog } from "../utils/log";

const execFileAsync = (cmd: string, args: string[]) =>
  new Promise<{ code: number | string | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        cmd,
        args,
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({
            code: error?.code ?? 0,
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
          });
        },
      );
    },
  );

function isSuccessCode(code: number | string | null): boolean {
  return code === 0 || code === null;
}

export interface PythonInfo {
  command: string;
  version: string;
  raw: string;
  source: string;
}

const PYTHON_CANDIDATES_BY_OS: Partial<Record<NodeJS.Platform, string[]>> = {
  win32: ["py", "python3", "python"],
  darwin: [
    "python3",
    "python",
    "/opt/homebrew/bin/python3",
    "/opt/homebrew/bin/python3.10",
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3.12",
    "/usr/local/bin/python3",
    "/usr/local/bin/python3.10",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3.12",
    "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    "/opt/miniconda3/bin/python3",
    "/opt/miniconda3/bin/python",
    "/opt/anaconda3/bin/python3",
    "/opt/anaconda3/bin/python",
    `${os.homedir()}/miniconda3/bin/python3`,
    `${os.homedir()}/miniconda3/bin/python`,
    `${os.homedir()}/anaconda3/bin/python3`,
    `${os.homedir()}/anaconda3/bin/python`,
    "/usr/bin/python3",
  ],
  linux: [
    "python3",
    "python",
    "/usr/bin/python3",
    "/usr/bin/python3.10",
    "/usr/bin/python3.11",
    "/usr/bin/python3.12",
    "/usr/local/bin/python3",
    "/usr/local/bin/python3.10",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3.12",
    `${os.homedir()}/miniconda3/bin/python3`,
    `${os.homedir()}/anaconda3/bin/python3`,
  ],
};

function parseMajorMinor(raw: string): number[] {
  const match = raw.match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return [];
  return [Number(match[1]), Number(match[2])];
}

export function isVersionSupported(version: number[]): boolean {
  if (version.length < 2) return false;
  const [major, minor] = version;
  if (major !== 3) return false;
  return minor >= 10 && minor < 13;
}

export async function listAvailablePythons(): Promise<PythonInfo[]> {
  const candidates = new Set(
    PYTHON_CANDIDATES_BY_OS[process.platform] ?? ["python3", "python"],
  );
  const seen = new Set<string>();
  const results: PythonInfo[] = [];
  for (const cmd of candidates) {
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const probe = await execFileAsync(cmd, ["--version"]);
    if (!isSuccessCode(probe.code)) continue;
    const raw = `${probe.stdout}${probe.stderr}`.trim();
    const versionNums = parseMajorMinor(raw);
    if (!isVersionSupported(versionNums)) continue;
    const tag = cmd.includes("/") ? `路径 ${cmd}` : "PATH 中的 python";
    results.push({
      command: cmd,
      version: `${versionNums[0]}.${versionNums[1]}`,
      raw,
      source: tag,
    });
  }
  return results;
}

export async function selectPython(
  preferredVersion: string,
): Promise<PythonInfo> {
  const candidates = await listAvailablePythons();
  if (candidates.length === 0) {
    throw new Error(
      "未在系统找到可用的 Python (3.10 - 3.12)，请安装 Python 3.10/3.11/3.12 后重启服务",
    );
  }
  const [prefMajor, prefMinor] = preferredVersion.split(".").map(Number);
  const exact = candidates.find(
    (c) => c.version === `${prefMajor}.${prefMinor}`,
  );
  if (exact) {
    audioLog.info(
      `已选择 Python: ${exact.command} (${exact.version}, 来自 ${exact.source})`,
    );
    return exact;
  }
  const list = candidates
    .map((c) => `  - ${c.command} (${c.version}, ${c.source})`)
    .join("\n");
  throw new Error(
    `系统未找到 Python ${preferredVersion}。可用的 Python:\n${list}\n请安装 Python ${preferredVersion} 或在 WebUI 的 audio 配置中切换到已安装的版本`,
  );
}

export async function ensurePip(pythonCmd: string): Promise<void> {
  const probe = await execFileAsync(pythonCmd, ["-m", "pip", "--version"]);
  if (isSuccessCode(probe.code)) {
    return;
  }
  audioLog.warn("未检测到 pip，尝试通过 ensurepip 引导安装 ...");
  const ensure = await execFileAsync(pythonCmd, ["-m", "ensurepip", "--upgrade"]);
  if (!isSuccessCode(ensure.code)) {
    throw new Error(
      `Python pip 未安装且 ensurepip 失败: ${ensure.stderr.trim() || ensure.stdout.trim()}`,
    );
  }
}