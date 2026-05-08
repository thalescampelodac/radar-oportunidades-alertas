"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMCPServer = initMCPServer;
const http = require("http");
const url_1 = require("url");
const free_stock_data_1 = require("../lib/free-stock-data");
const MCP_SERVER_PORT = Number(process.env.MCP_SERVER_PORT || 3031);
const MCP_SERVER_HOST = process.env.MCP_SERVER_HOST || "127.0.0.1";
const MCP_PATH = "/mcp";
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_SERVER_TIMEOUT_MS || 8000);
function logStep(message) {
    console.log(`[MCP Server] ${message}`);
}
function jsonSuccess(id, result) {
    return {
        jsonrpc: "2.0",
        id,
        result,
    };
}
function jsonError(id, code, message) {
    return {
        jsonrpc: "2.0",
        id,
        error: {
            code,
            message,
        },
    };
}
function normalizeTickers(value) {
    if (!Array.isArray(value)) {
        return (0, free_stock_data_1.getAvailableBrazilianTickers)();
    }
    const parsed = value
        .filter((item) => typeof item === "string")
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean);
    return parsed.length > 0 ? parsed : (0, free_stock_data_1.getAvailableBrazilianTickers)();
}
async function executeTool(method, params) {
    switch (method) {
        case "healthcheck":
            return {
                status: "ok",
                server: "radar-mcp",
                availableTools: ["healthcheck", "get_stock_fundamentals"],
            };
        case "get_stock_fundamentals": {
            const tickers = normalizeTickers(params?.tickers);
            logStep(`Executando tool get_stock_fundamentals para ${tickers.join(", ")}`);
            return (0, free_stock_data_1.getBrazilianStocksFundamentals)(tickers);
        }
        default:
            throw new Error(`Tool nao suportada: ${method}`);
    }
}
async function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => {
            chunks.push(Buffer.from(chunk));
        });
        request.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf-8"));
        });
        request.on("error", reject);
    });
}
async function handleJsonRpc(request, response) {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body || "{}");
    const id = payload.id ?? null;
    if (payload.jsonrpc !== "2.0" || !payload.method) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jsonError(id, -32600, "Invalid JSON-RPC request")));
        return;
    }
    let timeoutId;
    try {
        const result = await Promise.race([
            executeTool(payload.method, payload.params),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("MCP tool timeout")), REQUEST_TIMEOUT_MS);
            }),
        ]);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jsonSuccess(id, result)));
    }
    catch (error) {
        logStep(`Falha na tool ${payload.method}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jsonError(id, -32000, error instanceof Error ? error.message : "Erro desconhecido no MCP")));
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}
function initMCPServer() {
    const server = http.createServer(async (request, response) => {
        const url = new url_1.URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
        if (request.method === "GET" && url.pathname === "/health") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({
                status: "ok",
                path: MCP_PATH,
                port: MCP_SERVER_PORT,
            }));
            return;
        }
        if (request.method === "POST" && url.pathname === MCP_PATH) {
            await handleJsonRpc(request, response);
            return;
        }
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Not found" }));
    });
    server.listen(MCP_SERVER_PORT, MCP_SERVER_HOST, () => {
        logStep(`Servidor ouvindo em http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}${MCP_PATH}`);
    });
    return server;
}
if (require.main === module) {
    initMCPServer();
}
