import type { ComputeDevice } from "../types";

export interface HealthCheckResult {
  ok: boolean;
  reason?: string;
  code?: number;
}

export async function checkRuntimeReady(apiBase: string, timeoutMs = 5_000): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}/control?command=restart`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 400) return { ok: true };
    if (res.ok) return { ok: true };
    return { ok: false, code: res.status, reason: `unexpected status ${res.status}` };
  } catch (error: any) {
    clearTimeout(timer);
    return { ok: false, reason: error?.message ?? String(error) };
  }
}

export function inferIsHalf(device: ComputeDevice | null): boolean {
  return device === "cuda";
}
