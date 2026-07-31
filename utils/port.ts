import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { audioLog } from "./log";

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePids(raw: string): number[] {
  const pids = new Set<number>();
  for (const line of raw.split(/\r?\n/)) {
    const pid = Number(line.trim());
    if (Number.isFinite(pid) && pid > 0 && Math.floor(pid) === pid) {
      pids.add(pid);
    }
  }
  return Array.from(pids);
}

function parseNetstatPids(raw: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of raw.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0].toUpperCase() !== "TCP") continue;
    if (!/^LISTENING$/i.test(cols[3])) continue;
    const localPort = cols[1].slice(cols[1].lastIndexOf(":") + 1);
    if (Number(localPort) !== port) continue;
    const pid = Number(cols[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return Array.from(pids);
}

async function listListeningPids(
  port: number,
): Promise<{ pids: number[]; lsofAvailable: boolean }> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "TCP"]);
      return { pids: parseNetstatPids(stdout, port), lsofAvailable: true };
    } catch {
      return { pids: [], lsofAvailable: false };
    }
  }

  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return { pids: parsePids(stdout), lsofAvailable: true };
  } catch {
    return { pids: [], lsofAvailable: false };
  }
}

function sendSignal(pid: number, signal: NodeJS.Signals): boolean {
  if (pid === process.pid) return false;
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export async function freePort(
  port: number,
  graceMs = 1500,
): Promise<{ killedPids: number[]; remainingPids: number[] }> {
  const initial = await listListeningPids(port);
  const occupied = initial.pids.filter((pid) => pid !== process.pid);
  if (occupied.length === 0) {
    return { killedPids: [], remainingPids: [] };
  }

  audioLog.warn(
    `端口 ${port} 被占用，进程 PID: ${occupied.join(", ")}，正在结束...`,
  );

  const killed: number[] = [];
  for (const pid of occupied) {
    if (sendSignal(pid, "SIGTERM")) killed.push(pid);
  }
  if (killed.length > 0) await sleep(graceMs);

  let remaining = (await listListeningPids(port)).pids.filter(
    (pid) => pid !== process.pid,
  );
  if (remaining.length > 0) {
    audioLog.warn(
      `端口 ${port} 仍被占用 (PID: ${remaining.join(", ")})，发送 SIGKILL 强制结束...`,
    );
    for (const pid of remaining) {
      if (sendSignal(pid, "SIGKILL")) killed.push(pid);
    }
    await sleep(300);
    remaining = (await listListeningPids(port)).pids.filter(
      (pid) => pid !== process.pid,
    );
  }

  if (remaining.length > 0) {
    audioLog.error(
      `端口 ${port} 仍被占用，无法结束进程 PID: ${remaining.join(", ")}`,
    );
  } else if (killed.length > 0) {
    audioLog.info(`端口 ${port} 已释放`);
  }

  return { killedPids: killed, remainingPids: remaining };
}
