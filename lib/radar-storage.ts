import { promises as fs } from "fs";
import * as path from "path";
import { get, put } from "@vercel/blob";
import { RadarData, RadarMeta } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const RADAR_FILE = path.join(DATA_DIR, "radar.json");
const RADAR_META_FILE = path.join(DATA_DIR, "radar-meta.json");
const BLOB_RADAR_PATH = "radar/radar.json";
const BLOB_RADAR_META_PATH = "radar/radar-meta.json";
const BLOB_ACCESS = (process.env.RADAR_BLOB_ACCESS || "private") as "private" | "public";

function useBlobStorage(): boolean {
  if (process.env.RADAR_STORAGE_MODE === "blob") {
    return true;
  }

  if (process.env.RADAR_STORAGE_MODE === "local") {
    return false;
  }

  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isValidStock(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const stock = value as Record<string, unknown>;

  return (
    typeof stock.ticker === "string" &&
    typeof stock.name === "string" &&
    typeof stock.score === "number" &&
    (stock.category === "opportunity" || stock.category === "alert") &&
    typeof stock.justification === "string" &&
    typeof stock.metrics === "object" &&
    stock.metrics !== null &&
    isValidDateString(stock.lastUpdate)
  );
}

export function isValidRadarData(value: unknown): value is RadarData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const radar = value as Record<string, unknown>;

  return (
    Array.isArray(radar.opportunities) &&
    radar.opportunities.every(isValidStock) &&
    Array.isArray(radar.alerts) &&
    radar.alerts.every(isValidStock) &&
    isValidDateString(radar.lastUpdate) &&
    (radar.updateStatus === "automatic" || radar.updateStatus === "manual")
  );
}

export function isValidRadarMeta(value: unknown): value is RadarMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const meta = value as Record<string, unknown>;

  return (
    isValidDateString(meta.lastUpdateTime) &&
    isValidDateString(meta.nextUpdateTime) &&
    typeof meta.updateInterval === "number" &&
    meta.updateInterval > 0 &&
    typeof meta.source === "string" &&
    typeof meta.cacheValid === "boolean"
  );
}

async function writeJsonAtomically(filePath: string, data: unknown): Promise<void> {
  const tempFile = `${filePath}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempFile, filePath);
}

async function readJsonFromBlob<T>(pathname: string): Promise<T> {
  const result = await get(pathname, {
    access: BLOB_ACCESS,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob ${pathname} not found`);
  }

  const content = await new Response(result.stream).text();
  return JSON.parse(content) as T;
}

async function writeJsonToBlob(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: BLOB_ACCESS,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function readRadar(): Promise<RadarData> {
  if (useBlobStorage()) {
    const parsed = await readJsonFromBlob<unknown>(BLOB_RADAR_PATH);

    if (!isValidRadarData(parsed)) {
      throw new Error("radar blob is invalid");
    }

    return parsed;
  }

  await ensureDataDir();

  const content = await fs.readFile(RADAR_FILE, "utf-8");
  const parsed = JSON.parse(content);

  if (!isValidRadarData(parsed)) {
    throw new Error("radar.json is invalid");
  }

  return parsed;
}

export async function writeRadar(data: RadarData): Promise<void> {
  if (!isValidRadarData(data)) {
    throw new Error("Refusing to write invalid radar data");
  }

  if (useBlobStorage()) {
    await writeJsonToBlob(BLOB_RADAR_PATH, data);
    return;
  }

  await ensureDataDir();
  await writeJsonAtomically(RADAR_FILE, data);
}

export async function readRadarMeta(): Promise<RadarMeta> {
  const defaultMeta: RadarMeta = {
    lastUpdateTime: new Date().toISOString(),
    nextUpdateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updateInterval: 24,
    source: useBlobStorage() ? "blob-initial" : "initial",
    cacheValid: true,
  };

  if (useBlobStorage()) {
    try {
      const parsed = await readJsonFromBlob<unknown>(BLOB_RADAR_META_PATH);

      if (!isValidRadarMeta(parsed)) {
        throw new Error("radar-meta blob is invalid");
      }

      return parsed;
    } catch {
      await writeRadarMeta(defaultMeta);
      return defaultMeta;
    }
  }

  await ensureDataDir();

  try {
    const content = await fs.readFile(RADAR_META_FILE, "utf-8");
    const parsed = JSON.parse(content);

    if (!isValidRadarMeta(parsed)) {
      throw new Error("radar-meta.json is invalid");
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }

    await writeRadarMeta(defaultMeta);
    return defaultMeta;
  }
}

export async function writeRadarMeta(meta: RadarMeta): Promise<void> {
  if (!isValidRadarMeta(meta)) {
    throw new Error("Refusing to write invalid radar metadata");
  }

  if (useBlobStorage()) {
    await writeJsonToBlob(BLOB_RADAR_META_PATH, meta);
    return;
  }

  await ensureDataDir();
  await writeJsonAtomically(RADAR_META_FILE, meta);
}

export async function isCacheValid(): Promise<boolean> {
  try {
    const meta = await readRadarMeta();
    const lastUpdate = new Date(meta.lastUpdateTime).getTime();
    const now = Date.now();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    return hoursSinceUpdate < meta.updateInterval;
  } catch {
    return false;
  }
}

export async function getTimeUntilNextUpdate(): Promise<number> {
  try {
    const meta = await readRadarMeta();
    const nextUpdate = new Date(meta.nextUpdateTime).getTime();
    const now = Date.now();
    return Math.max(0, nextUpdate - now);
  } catch {
    return 0;
  }
}

export function getRadarStorageMode(): "blob" | "local" {
  return useBlobStorage() ? "blob" : "local";
}
