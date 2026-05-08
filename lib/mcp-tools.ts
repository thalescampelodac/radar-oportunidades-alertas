import {
  getAvailableBrazilianTickers,
  getBrazilianStocksFundamentals,
} from "./free-stock-data";

export interface MCPToolParams {
  tickers?: unknown;
}

function normalizeTickers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return getAvailableBrazilianTickers();
  }

  const parsed = value
    .filter((item): item is string => typeof item === "string")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : getAvailableBrazilianTickers();
}

export async function executeMCPTool(
  method: string,
  params?: MCPToolParams
): Promise<unknown> {
  switch (method) {
    case "healthcheck":
      return {
        status: "ok",
        server: "radar-mcp",
        availableTools: ["healthcheck", "get_stock_fundamentals"],
      };

    case "get_stock_fundamentals": {
      const tickers = normalizeTickers(params?.tickers);
      return getBrazilianStocksFundamentals(tickers);
    }

    default:
      throw new Error(`Tool nao suportada: ${method}`);
  }
}
