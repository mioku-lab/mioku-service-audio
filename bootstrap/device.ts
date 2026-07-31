import { execFile } from "node:child_process";
import * as os from "node:os";
import { audioLog } from "../utils/log";
import type { ComputeDevice } from "../types";
import { MIN_RAM_GB } from "../constants";

const execFileAsync = (cmd: string, args: string[]) =>
  new Promise<{ code: number | string | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        cmd,
        args,
        { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
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

export interface DeviceProbe {
  device: ComputeDevice;
  gpuName?: string;
  vramMb?: number;
  totalMemoryGb: number;
  reason: string;
}

async function probeNvidiaSmi(): Promise<{ name?: string; vramMb?: number }> {
  const probe = await execFileAsync("nvidia-smi", [
    "--query-gpu=name,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  if (!isSuccessCode(probe.code) || !probe.stdout.trim()) return {};
  const firstLine = probe.stdout.trim().split(/\r?\n/)[0] ?? "";
  const [name, vram] = firstLine.split(",").map((s) => s.trim());
  return {
    name: name || undefined,
    vramMb: vram ? Number(vram) : undefined,
  };
}

function detectTotalMemoryGb(): number {
  return Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2));
}

interface AppleProbe {
  isApple: boolean;
  totalGb: number;
}

function detectAppleSilicon(): AppleProbe {
  if (process.platform !== "darwin") {
    return { isApple: false, totalGb: detectTotalMemoryGb() };
  }
  const arch = process.arch;
  const cpuModel = os.cpus()?.[0]?.model ?? "";
  const isApple = arch === "arm64" && /Apple/i.test(cpuModel);
  return { isApple, totalGb: detectTotalMemoryGb() };
}

export async function probeDevice(): Promise<DeviceProbe> {
  const nvidia = await probeNvidiaSmi();
  if (nvidia.name) {
    audioLog.info(
      `已选择设备: cuda (${nvidia.name}${nvidia.vramMb ? `, VRAM ${nvidia.vramMb}MB` : ""})`,
    );
    return {
      device: "cuda",
      gpuName: nvidia.name,
      vramMb: nvidia.vramMb,
      totalMemoryGb: detectTotalMemoryGb(),
      reason: "nvidia-smi 报告可用 NVIDIA GPU",
    };
  }

  const apple = detectAppleSilicon();
  if (apple.isApple) {
    audioLog.info(`已选择设备: mps (Apple Silicon, ${apple.totalGb}GB RAM)`);
    return {
      device: "mps",
      totalMemoryGb: apple.totalGb,
      reason: "Apple Silicon detected",
    };
  }

  const totalGb = apple.totalGb;
  if (totalGb >= MIN_RAM_GB) {
    audioLog.warn(
      `未检测到加速硬件， 使用 cpu (${totalGb}GB RAM >= ${MIN_RAM_GB}GB)`,
    );
    return {
      device: "cpu",
      totalMemoryGb: totalGb,
      reason: `内存 ${totalGb}GB 满足 CPU 推理最低要求`,
    };
  }

  throw new Error(
    `未检测到可用加速设备且内存仅 ${totalGb}GB < ${MIN_RAM_GB}GB，无法满足 GPT-SoVITS 推理要求`,
  );
}

export function inferHalfPrecision(device: ComputeDevice): boolean {
  return device === "cuda";
}
