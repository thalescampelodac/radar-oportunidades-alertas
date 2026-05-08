import fs from "fs";
import path from "path";
import { RadarData, RadarMeta } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const RADAR_FILE = path.join(DATA_DIR, "radar.json");
const RADAR_META_FILE = path.join(DATA_DIR, "radar-meta.json");

/**
 * Garante que o diretório /data existe
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

function writeJsonAtomically(filePath: string, data: unknown): void {
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempFile, filePath);
}

/**
 * Lê o arquivo radar.json
 */
export function readRadar(): RadarData {
  ensureDataDir();

  if (!fs.existsSync(RADAR_FILE)) {
    throw new Error("radar.json not found");
  }

  const content = fs.readFileSync(RADAR_FILE, "utf-8");
  const parsed = JSON.parse(content);

  if (!isValidRadarData(parsed)) {
    throw new Error("radar.json is invalid");
  }

  return parsed;
}

/**
 * Escreve dados no radar.json
 */
export function writeRadar(data: RadarData): void {
  ensureDataDir();

  if (!isValidRadarData(data)) {
    throw new Error("Refusing to write invalid radar data");
  }

  writeJsonAtomically(RADAR_FILE, data);
}

/**
 * Lê o arquivo radar-meta.json
 */
export function readRadarMeta(): RadarMeta {
  ensureDataDir();

  if (!fs.existsSync(RADAR_META_FILE)) {
    // Se não existir, cria um meta padrão
    const defaultMeta: RadarMeta = {
      lastUpdateTime: new Date().toISOString(),
      nextUpdateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updateInterval: 24,
      source: "initial",
      cacheValid: true,
    };
    writeRadarMeta(defaultMeta);
    return defaultMeta;
  }

  const content = fs.readFileSync(RADAR_META_FILE, "utf-8");
  const parsed = JSON.parse(content);

  if (!isValidRadarMeta(parsed)) {
    throw new Error("radar-meta.json is invalid");
  }

  return parsed;
}

/**
 * Escreve dados no radar-meta.json
 */
export function writeRadarMeta(meta: RadarMeta): void {
  ensureDataDir();

  if (!isValidRadarMeta(meta)) {
    throw new Error("Refusing to write invalid radar metadata");
  }

  writeJsonAtomically(RADAR_META_FILE, meta);
}

/**
 * Verifica se o cache é válido (menos de 24 horas)
 */
export function isCacheValid(): boolean {
  try {
    const meta = readRadarMeta();
    const lastUpdate = new Date(meta.lastUpdateTime).getTime();
    const now = new Date().getTime();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    return hoursSinceUpdate < meta.updateInterval;
  } catch {
    return false;
  }
}

/**
 * Retorna o tempo até a próxima atualização permitida (em ms)
 */
export function getTimeUntilNextUpdate(): number {
  try {
    const meta = readRadarMeta();
    const nextUpdate = new Date(meta.nextUpdateTime).getTime();
    const now = new Date().getTime();
    return Math.max(0, nextUpdate - now);
  } catch {
    return 0;
  }
}
