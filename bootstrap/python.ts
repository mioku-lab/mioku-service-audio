import { execFile } from "node:child_process";
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
}

const PYTHON_CANDIDATES_BY_OS: Partial<Record<NodeJS.Platform, string[]>> = {
  win32: ["py", "python3", "python"],
  darwin: [
    "python3",
    "python",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ],
  linux: [
    "python3",
    "python",
    "/usr/bin/python3",
    "/usr/local/bin/python3",
  ],
};

function parseMajorMinor(raw: string): number[] {
  const match = raw.match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) return [];
  return [Number(match[1]), Number(match[2])];
}

export function compareVersion(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function isVersionSupported(version: number[]): boolean {
  if (version.length < 2) return false;
  const [major, minor] = version;
  if (major !== 3) return false;
  return minor >= 9 && minor < 13;
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
    results.push({
      command: cmd,
      version: `${versionNums[0]}.${versionNums[1]}`,
      raw,
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
      "未在系统找到可用的 Python (3.9 ~ 3.12)，请先安装 Python 后重启服务",
    );
  }
  const [prefMajor, prefMinor] = preferredVersion.split(".").map(Number);
  const exact = candidates.find(
    (c) => c.version === `${prefMajor}.${prefMinor}`,
  );
  if (exact) {
    audioLog.info(`已选择 Python: ${exact.command} (${exact.version})`);
    return exact;
  }
  const sorted = [...candidates].sort((a, b) => {
    const av = a.version.split(".").map(Number);
    const bv = b.version.split(".").map(Number);
    return compareVersion(bv, av);
  });
  const fallback = sorted[0];
  audioLog.warn(
    `未找到 Python ${preferredVersion}，回退到 ${fallback.command} (${fallback.version})`,
  );
  return fallback;
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
