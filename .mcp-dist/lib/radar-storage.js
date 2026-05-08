"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidRadarData = isValidRadarData;
exports.isValidRadarMeta = isValidRadarMeta;
exports.readRadar = readRadar;
exports.writeRadar = writeRadar;
exports.readRadarMeta = readRadarMeta;
exports.writeRadarMeta = writeRadarMeta;
exports.isCacheValid = isCacheValid;
exports.getTimeUntilNextUpdate = getTimeUntilNextUpdate;
const fs = require("fs");
const path = require("path");
const DATA_DIR = path.join(process.cwd(), "data");
const RADAR_FILE = path.join(DATA_DIR, "radar.json");
const RADAR_META_FILE = path.join(DATA_DIR, "radar-meta.json");
/**
 * Garante que o diretório /data existe
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function isValidDateString(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
function isValidStock(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const stock = value;
    return (typeof stock.ticker === "string" &&
        typeof stock.name === "string" &&
        typeof stock.score === "number" &&
        (stock.category === "opportunity" || stock.category === "alert") &&
        typeof stock.justification === "string" &&
        typeof stock.metrics === "object" &&
        stock.metrics !== null &&
        isValidDateString(stock.lastUpdate));
}
function isValidRadarData(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const radar = value;
    return (Array.isArray(radar.opportunities) &&
        radar.opportunities.every(isValidStock) &&
        Array.isArray(radar.alerts) &&
        radar.alerts.every(isValidStock) &&
        isValidDateString(radar.lastUpdate) &&
        (radar.updateStatus === "automatic" || radar.updateStatus === "manual"));
}
function isValidRadarMeta(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const meta = value;
    return (isValidDateString(meta.lastUpdateTime) &&
        isValidDateString(meta.nextUpdateTime) &&
        typeof meta.updateInterval === "number" &&
        meta.updateInterval > 0 &&
        typeof meta.source === "string" &&
        typeof meta.cacheValid === "boolean");
}
function writeJsonAtomically(filePath, data) {
    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, filePath);
}
/**
 * Lê o arquivo radar.json
 */
function readRadar() {
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
function writeRadar(data) {
    ensureDataDir();
    if (!isValidRadarData(data)) {
        throw new Error("Refusing to write invalid radar data");
    }
    writeJsonAtomically(RADAR_FILE, data);
}
/**
 * Lê o arquivo radar-meta.json
 */
function readRadarMeta() {
    ensureDataDir();
    if (!fs.existsSync(RADAR_META_FILE)) {
        // Se não existir, cria um meta padrão
        const defaultMeta = {
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
function writeRadarMeta(meta) {
    ensureDataDir();
    if (!isValidRadarMeta(meta)) {
        throw new Error("Refusing to write invalid radar metadata");
    }
    writeJsonAtomically(RADAR_META_FILE, meta);
}
/**
 * Verifica se o cache é válido (menos de 24 horas)
 */
function isCacheValid() {
    try {
        const meta = readRadarMeta();
        const lastUpdate = new Date(meta.lastUpdateTime).getTime();
        const now = new Date().getTime();
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
        return hoursSinceUpdate < meta.updateInterval;
    }
    catch {
        return false;
    }
}
/**
 * Retorna o tempo até a próxima atualização permitida (em ms)
 */
function getTimeUntilNextUpdate() {
    try {
        const meta = readRadarMeta();
        const nextUpdate = new Date(meta.nextUpdateTime).getTime();
        const now = new Date().getTime();
        return Math.max(0, nextUpdate - now);
    }
    catch {
        return 0;
    }
}
