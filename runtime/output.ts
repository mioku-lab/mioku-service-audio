import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_TEMP_DIR = path.join(process.cwd(), "temp", "audio");

export function defaultTempDir(): string {
  return DEFAULT_TEMP_DIR;
}

export function resolveOutputPath(
  preferredDir: string | undefined,
  preferredName: string | undefined,
  extension: string,
): { dir: string; filePath: string; fileName: string } {
  const dir = path.resolve(preferredDir ?? defaultTempDir());
  return buildTarget(dir, preferredName, extension);
}

export async function ensureOutputDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeBytes(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

function buildTarget(
  dir: string,
  preferredName: string | undefined,
  extension: string,
): { dir: string; filePath: string; fileName: string } {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  const safeName =
    sanitize(preferredName) || `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const fileName = safeName.endsWith(ext) ? safeName : `${safeName}${ext}`;
  return { dir, filePath: path.join(dir, fileName), fileName };
}

function sanitize(input: string | undefined): string | null {
  if (!input) return null;
  return input
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.\-]/g, "")
    .slice(0, 80) || null;
}
