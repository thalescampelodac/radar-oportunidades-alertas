/**
 * Serviço para buscar dados gratuitos de ações brasileiras.
 *
 * Estratégia desta fase:
 * - Fonte real primária: brapi.dev
 * - Sem token: usa a lista gratuita suportada pela própria brapi
 * - Com token opcional no backend: a mesma integração pode ser expandida
 * - Fallback seguro: cache atual do radar e mocks existentes
 */

import { readRadar } from "./radar-storage";

export interface StockFundamentals {
  ticker: string;
  name: string;
  dy?: number;
  pb?: number;
  pe?: number | null;
  roe?: number;
  debt?: number;
  liquidez?: number;
  price?: number;
  change24h?: number;
  source?: string;
}

interface BrapiQuoteResponse {
  results?: BrapiQuoteResult[];
}

interface BrapiQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  defaultKeyStatistics?: {
    priceToBook?: number;
    trailingPE?: number;
    forwardPE?: number;
    trailingEps?: number;
    dividendYield?: number;
    trailingAnnualDividendYield?: number;
  };
  financialData?: {
    returnOnEquity?: number;
    debtToEquity?: number;
    currentRatio?: number;
    quickRatio?: number;
  };
}

// Lista inicial reduzida que funciona sem token segundo a documentação da brapi.
const BRAZILIAN_TICKERS = ["PETR4", "VALE3", "MGLU3", "ITUB4"];

const FALLBACK_STOCKS: StockFundamentals[] = [
  { ticker: "VALE3", name: "Vale do Rio Doce", dy: 4.2, pb: 0.8, pe: 6.5, roe: 22.4, debt: 0.45, liquidez: 9.2, source: "mock" },
  { ticker: "WEGE3", name: "WEG S/A", dy: 1.8, pb: 2.1, pe: 14.3, roe: 18.5, debt: 0.22, liquidez: 8.8, source: "mock" },
  { ticker: "RADL3", name: "Raízen Energia", dy: 5.1, pb: 1.2, pe: 9.8, roe: 15.2, debt: 0.65, liquidez: 7.9, source: "mock" },
  { ticker: "CPLE6", name: "Copel", dy: 4.8, pb: 0.95, pe: 12.1, roe: 12.8, debt: 0.78, liquidez: 7.2, source: "mock" },
  { ticker: "ITSA4", name: "Itaúsa", dy: 3.2, pb: 0.72, pe: 8.9, roe: 14.1, debt: 0.18, liquidez: 8.5, source: "mock" },
  { ticker: "PETR4", name: "Petrobras", dy: 2.8, pb: 1.5, pe: 18.9, roe: 21.2, debt: 1.15, liquidez: 9.1, source: "mock" },
  { ticker: "BBAS3", name: "Banco do Brasil", dy: 6.5, pb: 0.85, pe: 11.2, roe: 8.9, debt: 0.35, liquidez: 9.3, source: "mock" },
  { ticker: "GOLL4", name: "Gol Linhas Aéreas", dy: 0, pb: 0.42, pe: null, roe: -2.1, debt: 3.22, liquidez: 4.5, source: "mock" },
  { ticker: "BRML3", name: "Bematech", dy: 0, pb: 0.28, pe: null, roe: -8.5, debt: 2.15, liquidez: 2.1, source: "mock" },
  { ticker: "UGPA3", name: "UGP Agro", dy: 0.5, pb: 0.65, pe: 25.8, roe: 6.2, debt: 1.88, liquidez: 5.8, source: "mock" },
];

function normalizePercent(value?: number): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }

  return value <= 1 ? value * 100 : value;
}

function normalizeDebtToEquity(value?: number): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }

  // A brapi costuma expor debtToEquity em percentual.
  return value > 10 ? value / 100 : value;
}

function normalizeNumber(value?: number | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }

  return value;
}

function calculatePe(result: BrapiQuoteResult): number | null | undefined {
  const trailingPE = normalizeNumber(result.defaultKeyStatistics?.trailingPE);
  if (trailingPE !== undefined && trailingPE > 0) {
    return trailingPE;
  }

  const price = normalizeNumber(result.regularMarketPrice);
  const trailingEps = normalizeNumber(result.defaultKeyStatistics?.trailingEps);

  if (price !== undefined && trailingEps !== undefined) {
    if (trailingEps <= 0) {
      return null;
    }

    return Number((price / trailingEps).toFixed(2));
  }

  return undefined;
}

function mapBrapiResult(result: BrapiQuoteResult): StockFundamentals | null {
  const ticker = result.symbol?.toUpperCase();
  if (!ticker) {
    return null;
  }

  const dy =
    normalizePercent(result.defaultKeyStatistics?.dividendYield) ??
    normalizePercent(result.defaultKeyStatistics?.trailingAnnualDividendYield);

  return {
    ticker,
    name: result.longName || result.shortName || ticker,
    dy,
    pb: normalizeNumber(result.defaultKeyStatistics?.priceToBook),
    pe: calculatePe(result),
    roe: normalizePercent(result.financialData?.returnOnEquity),
    debt: normalizeDebtToEquity(result.financialData?.debtToEquity),
    liquidez:
      normalizeNumber(result.financialData?.currentRatio) ??
      normalizeNumber(result.financialData?.quickRatio),
    price: normalizeNumber(result.regularMarketPrice),
    change24h: normalizeNumber(result.regularMarketChangePercent),
    source: "brapi",
  };
}

function getBrapiRequestTickers(requestedTickers: string[], hasToken: boolean): string[] {
  if (hasToken) {
    return requestedTickers;
  }

  const freeTierTickers = requestedTickers.filter((ticker) => BRAZILIAN_TICKERS.includes(ticker));
  return freeTierTickers.length > 0 ? freeTierTickers : BRAZILIAN_TICKERS;
}

async function fetchFromBrapi(tickers: string[]): Promise<StockFundamentals[]> {
  if (tickers.length === 0) {
    return [];
  }

  const token = process.env.BRAPI_API_KEY;
  const requestTickers = getBrapiRequestTickers(tickers, Boolean(token));
  const headers: HeadersInit = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = new URL(`https://brapi.dev/api/quote/${requestTickers.join(",")}`);
  url.searchParams.set("fundamental", "true");
  url.searchParams.set("dividends", "true");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log(
      `[StockData] Consultando brapi para ${requestTickers.join(", ")} | token configurado: ${token ? "sim" : "nao"}`
    );

    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[StockData] brapi respondeu ${response.status} ${response.statusText}`);
      return [];
    }

    const payload = (await response.json()) as BrapiQuoteResponse;
    const results = payload.results ?? [];
    const mapped = results
      .map(mapBrapiResult)
      .filter((stock): stock is StockFundamentals => stock !== null);

    console.log(`[StockData] brapi retornou ${mapped.length} ativos uteis`);
    return mapped;
  } catch (error) {
    console.error("[StockData] Erro na consulta da brapi:", error);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFallbackStocks(): StockFundamentals[] {
  try {
    const radar = readRadar();
    const allStocks = [...(radar.opportunities ?? []), ...(radar.alerts ?? [])];

    if (allStocks.length > 0) {
      console.log(`[StockData] Usando ${allStocks.length} ativos do radar atual como fallback`);

      return allStocks.map((stock) => ({
        ticker: stock.ticker,
        name: stock.name,
        dy: stock.metrics?.dy,
        pb: stock.metrics?.pb,
        pe: stock.metrics?.pe,
        roe: stock.metrics?.roe,
        debt: stock.metrics?.debt,
        liquidez: stock.metrics?.liquidez,
        source: "cache",
      }));
    }
  } catch {
    console.log("[StockData] Cache do radar indisponível, usando mocks internos");
  }

  return FALLBACK_STOCKS;
}

function mergeStocks(
  baseStocks: StockFundamentals[],
  liveStocks: StockFundamentals[]
): StockFundamentals[] {
  const merged = new Map<string, StockFundamentals>();

  for (const stock of baseStocks) {
    merged.set(stock.ticker, stock);
  }

  for (const stock of liveStocks) {
    const previous = merged.get(stock.ticker);
    merged.set(stock.ticker, {
      ...previous,
      ...stock,
      name: stock.name || previous?.name || stock.ticker,
      source: stock.source || previous?.source,
    });
  }

  return Array.from(merged.values());
}

export async function getBrazilianStocksFundamentals(
  tickers?: string[]
): Promise<StockFundamentals[]> {
  const tickersToFetch = tickers && tickers.length > 0 ? tickers : BRAZILIAN_TICKERS;
  return fetchFromBrapi(tickersToFetch);
}

export async function getBrazilianStocksWithFallback(
  tickers?: string[]
): Promise<StockFundamentals[]> {
  const baseStocks = getFallbackStocks();
  const liveStocks = await getBrazilianStocksFundamentals(tickers);

  if (liveStocks.length === 0) {
    console.log("[StockData] Nenhum dado real disponivel. Mantendo fallback atual.");
    return baseStocks;
  }

  const mergedStocks = mergeStocks(baseStocks, liveStocks);
  console.log(
    `[StockData] Merge concluído: ${liveStocks.length} ativos reais + ${baseStocks.length} de fallback`
  );

  return mergedStocks;
}

export function getAvailableBrazilianTickers(): string[] {
  return BRAZILIAN_TICKERS;
}
