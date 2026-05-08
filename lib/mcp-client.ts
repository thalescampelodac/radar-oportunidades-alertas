/**
 * Cliente MCP local para coleta de fundamentos.
 *
 * Nesta fase o fluxo de update fala apenas com este cliente.
 * O cliente conversa com o servidor MCP local via HTTP/JSON-RPC.
 */

export interface MCPStockData {
  ticker: string;
  name: string;
  price?: number;
  change24h?: number;
  dy?: number;
  pb?: number;
  pe?: number | null;
  roe?: number;
  debt?: number;
  liquidez?: number;
  source?: string;
}

interface MCPJsonRpcResponse<T> {
  id: string | number | null;
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:3031/mcp";
const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS || 8000);

function logStep(message: string): void {
  console.log(`[MCP Client] ${message}`);
}

async function callMCPTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  try {
    logStep(`Chamando tool ${tool} em ${MCP_SERVER_URL}`);

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${tool}-${Date.now()}`,
        method: tool,
        params: args,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as MCPJsonRpcResponse<T>;

    if (payload.error) {
      throw new Error(`MCP error ${payload.error.code}: ${payload.error.message}`);
    }

    if (payload.result === undefined) {
      throw new Error("MCP response sem result");
    }

    return payload.result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout ao chamar MCP apos ${MCP_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function connectMCPClient(): Promise<void> {
  await callMCPTool("healthcheck", {});
  logStep("Conexao com MCP confirmada");
}

export async function fetchStockDataViaMCP(
  ticker: string
): Promise<MCPStockData | null> {
  const results = await fetchMultipleStocksViaMCP([ticker]);
  return results[0] ?? null;
}

export async function fetchMultipleStocksViaMCP(
  tickers: string[]
): Promise<MCPStockData[]> {
  if (tickers.length === 0) {
    return [];
  }

  const result = await callMCPTool<MCPStockData[]>("get_stock_fundamentals", {
    tickers,
  });

  logStep(`Recebidos ${result.length} ativos do MCP`);
  return result;
}
