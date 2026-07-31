import { existsSync, mkdirSync, promises as fs } from "node:fs";

export function ensureDir(target: string): string {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
  }
  return target;
}

export async function ensureDirAsync(target: string): Promise<string> {
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = unknown>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  await ensureDirAsync(targetDir(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

function targetDir(file: string): string {
  const idx = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  return idx === -1 ? "." : file.slice(0, idx);
}

export function isExecutableFile(candidate: string): boolean {
  try {
    if (!existsSync(candidate)) return false;
    return require("node:fs").statSync(candidate).isFile();
  } catch {
    return false;
  }
}
