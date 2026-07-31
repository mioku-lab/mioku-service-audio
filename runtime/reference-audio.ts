import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  REFERENCE_AUDIO_DIRNAME,
  SUPPORTED_LANGS,
} from "../constants";
import type {
  ReferenceAudioManifest,
  ReferenceAudioManifestEntry,
  SupportedLang,
} from "../types";

export class ReferenceAudioStore {
  private readonly manifestPath: string;
  private readonly audioDir: string;
  private cache: ReferenceAudioManifest | null = null;

  constructor(serviceDataDir: string) {
    this.audioDir = path.join(serviceDataDir, REFERENCE_AUDIO_DIRNAME);
    this.manifestPath = path.join(serviceDataDir, "reference-audio.json");
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true });
    if (!(await pathExists(this.manifestPath))) {
      await this.writeManifest({
        schemaVersion: 1,
        entries: {},
      });
    }
  }

  async list(): Promise<ReferenceAudioManifestEntry[]> {
    const manifest = await this.readManifest();
    return Object.values(manifest.entries).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  async get(name: string): Promise<ReferenceAudioManifestEntry | null> {
    const manifest = await this.readManifest();
    return manifest.entries[name] ?? null;
  }

  async add(input: {
    name: string;
    sourceFile: string;
    promptText: string;
    lang: SupportedLang;
  }): Promise<ReferenceAudioManifestEntry> {
    await this.ensureReady();
    const manifest = await this.readManifest();
    const ext = path.extname(input.sourceFile).toLowerCase() || ".wav";
    const safeName = sanitizeFilename(input.name);
    const fileName = `${safeName}${ext}`;
    const targetPath = path.join(this.audioDir, fileName);
    const now = Date.now();
    await fs.copyFile(input.sourceFile, targetPath);

    const entry: ReferenceAudioManifestEntry = {
      name: safeName,
      fileName,
      promptText: input.promptText,
      lang: normalizeLang(input.lang),
      createdAt: manifest.entries[safeName]?.createdAt ?? now,
      updatedAt: now,
    };
    manifest.entries[safeName] = entry;
    await this.writeManifest(manifest);
    return entry;
  }

  async remove(name: string): Promise<boolean> {
    await this.ensureReady();
    const manifest = await this.readManifest();
    const entry = manifest.entries[name];
    if (!entry) return false;
    const filePath = path.join(this.audioDir, entry.fileName);
    try {
      await fs.unlink(filePath);
    } catch {
    }
    delete manifest.entries[name];
    await this.writeManifest(manifest);
    return true;
  }

  async resolveAudioPath(name: string): Promise<string | null> {
    const entry = await this.get(name);
    if (!entry) return null;
    return path.join(this.audioDir, entry.fileName);
  }

  private async readManifest(): Promise<ReferenceAudioManifest> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.manifestPath, "utf-8");
      this.cache = JSON.parse(raw) as ReferenceAudioManifest;
    } catch {
      this.cache = { schemaVersion: 1, entries: {} };
    }
    if (!this.cache || typeof this.cache !== "object") {
      this.cache = { schemaVersion: 1, entries: {} };
    }
    if (!this.cache.entries || typeof this.cache.entries !== "object") {
      this.cache.entries = {};
    }
    return this.cache;
  }

  private async writeManifest(manifest: ReferenceAudioManifest): Promise<void> {
    this.cache = manifest;
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(
      this.manifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  }
}

export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-]/g, "")
    .slice(0, 60) || "ref";
}

export function normalizeLang(lang: SupportedLang | string): SupportedLang {
  const lower = String(lang).toLowerCase();
  if ((SUPPORTED_LANGS as readonly string[]).includes(lower)) {
    return lower as SupportedLang;
  }
  return "zh";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
