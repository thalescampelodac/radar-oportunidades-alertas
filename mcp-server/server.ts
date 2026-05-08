import * as http from "http";
import { URL } from "url";
import { executeMCPTool } from "../lib/mcp-tools";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
}

const MCP_SERVER_PORT = Number(process.env.MCP_SERVER_PORT || 3031);
const MCP_SERVER_HOST = process.env.MCP_SERVER_HOST || "127.0.0.1";
const MCP_PATH = "/mcp";
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_SERVER_TIMEOUT_MS || 8000);

function logStep(message: string): void {
  console.log(`[MCP Server] ${message}`);
}

function jsonSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonError(id: string | number | null, code: number, message: string): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

async function executeTool(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
  if (method === "get_stock_fundamentals" && Array.isArray(params?.tickers)) {
    const tickers = params.tickers
      .filter((item): item is string => typeof item === "string")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean);

    if (tickers.length > 0) {
      logStep(`Executando tool get_stock_fundamentals para ${tickers.join(", ")}`);
    }
  }

  return executeMCPTool(method, params);
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    request.on("error", reject);
  });
}

async function handleJsonRpc(
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const body = await readRequestBody(request);
  const payload = JSON.parse(body || "{}") as JsonRpcRequest;
  const id = payload.id ?? null;

  if (payload.jsonrpc !== "2.0" || !payload.method) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify(jsonError(id, -32600, "Invalid JSON-RPC request")));
    return;
  }

  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      executeTool(payload.method, payload.params),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("MCP tool timeout")), REQUEST_TIMEOUT_MS);
      }),
    ]);

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(jsonSuccess(id, result)));
  } catch (error) {
    logStep(
      `Falha na tool ${payload.method}: ${error instanceof Error ? error.message : "erro desconhecido"}`
    );
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify(
        jsonError(
          id,
          -32000,
          error instanceof Error ? error.message : "Erro desconhecido no MCP"
        )
      )
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function initMCPServer(): http.Server {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          status: "ok",
          path: MCP_PATH,
          port: MCP_SERVER_PORT,
        })
      );
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
