/**
 * Script de atualização diária do radar
 *
 * Este script é executado apenas 1 vez a cada 24 horas
 * Pode ser chamado por:
 * - Cron job externo (ex: EasyCron, GitHub Actions)
 * - Endpoint POST /api/cron/update-radar
 * - Manualmente em desenvolvimento
 *
 * Fluxo:
 * 1. Verifica se 24h passaram desde a última atualização
 * 2. Se sim, busca dados reais via APIs gratuitas com fallback para mock
 * 3. Analisa com regras locais
 * 4. Enriquecimento textual opcional com Gemini
 * 5. Salva em /data/radar.json
 * 6. Atualiza /data/radar-meta.json
 *
 * Fase 2: Integração com dados reais
 * - Fonte real primária: brapi.dev
 * - Sem token, usa a lista gratuita suportada
 * - Se falhar, mantém cache/mock sem sobrescrever com erro
 * - Gemini apenas enriquece texto e nunca bloqueia a atualizacao
 */

import { readRadarMeta, writeRadar, writeRadarMeta, readRadar } from "../lib/radar-storage";
import { analyzeByRules } from "../lib/stock-rules";
import { RadarData, RadarMeta, Stock } from "../lib/types";
import { connectMCPClient, fetchMultipleStocksViaMCP } from "../lib/mcp-client";
import { enrichRadarWithGemini, isGeminiConfigured } from "../lib/gemini";

// Dados mockados para fallback final
// São usados apenas se:
// 1. Todas as APIs gratuitas falharem
// 2. Cache não estiver disponível
// 3. Erro crítico ocorrer
const MOCK_STOCKS: Array<{
  ticker: string;
  name: string;
  metrics: Record<string, number | null>;
}> = [
  {
    ticker: "VALE3",
    name: "Vale do Rio Doce",
    metrics: { dy: 4.2, pb: 0.8, pe: 6.5, roe: 22.4, debt: 0.45, liquidez: 9.2 },
  },
  {
    ticker: "WEGE3",
    name: "WEG S/A",
    metrics: { dy: 1.8, pb: 2.1, pe: 14.3, roe: 18.5, debt: 0.22, liquidez: 8.8 },
  },
  {
    ticker: "RADL3",
    name: "Raízen Energia",
    metrics: { dy: 5.1, pb: 1.2, pe: 9.8, roe: 15.2, debt: 0.65, liquidez: 7.9 },
  },
  {
    ticker: "CPLE6",
    name: "Copel",
    metrics: { dy: 4.8, pb: 0.95, pe: 12.1, roe: 12.8, debt: 0.78, liquidez: 7.2 },
  },
  {
    ticker: "ITSA4",
    name: "Itaúsa",
    metrics: { dy: 3.2, pb: 0.72, pe: 8.9, roe: 14.1, debt: 0.18, liquidez: 8.5 },
  },
  {
    ticker: "PETR4",
    name: "Petrobras",
    metrics: { dy: 2.8, pb: 1.5, pe: 18.9, roe: 21.2, debt: 1.15, liquidez: 9.1 },
  },
  {
    ticker: "BBAS3",
    name: "Banco do Brasil",
    metrics: { dy: 6.5, pb: 0.85, pe: 11.2, roe: 8.9, debt: 0.35, liquidez: 9.3 },
  },
  {
    ticker: "GOLL4",
    name: "Gol Linhas Aéreas",
    metrics: { pb: 0.42, pe: null, roe: -2.1, debt: 3.22, liquidez: 4.5, dy: 0 },
  },
  {
    ticker: "BRML3",
    name: "Bematech",
    metrics: { pb: 0.28, pe: null, roe: -8.5, debt: 2.15, liquidez: 2.1, dy: 0 },
  },
  {
    ticker: "UGPA3",
    name: "UGP Agro",
    metrics: { dy: 0.5, pb: 0.65, pe: 25.8, roe: 6.2, debt: 1.88, liquidez: 5.8 },
  },
];

const RADAR_TICKERS = MOCK_STOCKS.map((stock) => stock.ticker);

function logStep(message: string): void {
  console.log(`[RadarUpdate] ${message}`);
}

/**
 * Verifica se é permitido atualizar (respeita intervalo de 24h)
 */
function isUpdateAllowed(): boolean {
  try {
    const meta = readRadarMeta();
    const lastUpdate = new Date(meta.lastUpdateTime).getTime();
    const now = new Date().getTime();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    logStep(
      `Horas desde ultima atualizacao: ${hoursSinceUpdate.toFixed(2)} | fonte atual: ${meta.source}`
    );

    return hoursSinceUpdate >= meta.updateInterval;
  } catch {
    logStep("Primeira execucao ou erro ao ler meta. Atualizacao permitida.");
    return true;
  }
}

/**
 * Busca dados de ações (tenta real, fallback para mock)
 * Fase 2: Integração com dados reais
 */
async function fetchStockData(): Promise<Array<{
  ticker: string;
  name: string;
  metrics: Record<string, number | null>;
}>> {
  console.log("\n=== Fase 2: Buscando dados reais de ações brasileiras via MCP ===");

  try {
    logStep("Conectando ao MCP local");
    await connectMCPClient();
    logStep(`Solicitando fundamentos ao MCP para ${RADAR_TICKERS.join(", ")}`);
    const realStocks = await fetchMultipleStocksViaMCP(RADAR_TICKERS);

    if (realStocks && realStocks.length > 0) {
      logStep(`${realStocks.length} acoes retornadas pelo MCP`);
      return realStocks.map((stock) => mapStockToAnalysisInput(stock));
    }

    logStep("MCP nao retornou dados utilizaveis.");
    return [];
  } catch (error) {
    console.error("[RadarUpdate] Erro no fluxo MCP:", error);
    logStep("MCP falhou durante a coleta.");
    return [];
  }
}

function mapStockToAnalysisInput(stock: {
  ticker: string;
  name?: string;
  dy?: number;
  pb?: number;
  pe?: number | null;
  roe?: number;
  debt?: number;
  liquidez?: number;
}): {
  ticker: string;
  name: string;
  metrics: Record<string, number | null>;
} {
  const metrics: Record<string, number | null> = {};
  if (stock.dy !== undefined) metrics.dy = stock.dy;
  if (stock.pb !== undefined) metrics.pb = stock.pb;
  if (stock.pe !== undefined || stock.pe === null) metrics.pe = stock.pe ?? null;
  if (stock.roe !== undefined) metrics.roe = stock.roe;
  if (stock.debt !== undefined) metrics.debt = stock.debt;
  if (stock.liquidez !== undefined) metrics.liquidez = stock.liquidez;

  return {
    ticker: stock.ticker,
    name: stock.name || stock.ticker,
    metrics,
  };
}

function buildFallbackAnalysisStocks(
  cachedRadar: RadarData | undefined
): Array<{ ticker: string; name: string; metrics: Record<string, number | null> }> {
  if (cachedRadar) {
    const allStocks = [...cachedRadar.opportunities, ...cachedRadar.alerts];
    if (allStocks.length > 0) {
      return allStocks.map((stock) => ({
        ticker: stock.ticker,
        name: stock.name,
        metrics: {
          dy: stock.metrics.dy ?? null,
          pb: stock.metrics.pb ?? null,
          pe: stock.metrics.pe ?? null,
          roe: stock.metrics.roe ?? null,
          debt: stock.metrics.debt ?? null,
          liquidez: stock.metrics.liquidez ?? null,
        },
      }));
    }
  }

  return MOCK_STOCKS;
}

function mergeWithFallbackStocks(
  liveStocks: Array<{ ticker: string; name: string; metrics: Record<string, number | null> }>,
  fallbackStocks: Array<{ ticker: string; name: string; metrics: Record<string, number | null> }>
): Array<{ ticker: string; name: string; metrics: Record<string, number | null> }> {
  const merged = new Map<string, { ticker: string; name: string; metrics: Record<string, number | null> }>();

  for (const stock of fallbackStocks) {
    merged.set(stock.ticker, stock);
  }

  for (const stock of liveStocks) {
    const previous = merged.get(stock.ticker);
    merged.set(stock.ticker, {
      ...previous,
      ...stock,
      name: stock.name || previous?.name || stock.ticker,
      metrics: {
        ...(previous?.metrics || {}),
        ...stock.metrics,
      },
    });
  }

  return Array.from(merged.values());
}

/**
 * Analisa e classifica ações
 */
function analyzeStocks(
  stocks: Array<{ ticker: string; name: string; metrics: Record<string, number | null> }>
): { opportunities: Stock[]; alerts: Stock[] } {
  const opportunities: Stock[] = [];
  const alerts: Stock[] = [];

  for (const stock of stocks) {
    const normalizedMetrics = {
      dy: stock.metrics.dy ?? undefined,
      pb: stock.metrics.pb ?? undefined,
      pe: stock.metrics.pe,
      roe: stock.metrics.roe ?? undefined,
      debt: stock.metrics.debt ?? undefined,
      liquidez: stock.metrics.liquidez ?? undefined,
    };

    const analysis = analyzeByRules(stock.ticker, normalizedMetrics);

    const stockData: Stock = {
      ticker: stock.ticker,
      name: stock.name,
      score: analysis.score,
      category: analysis.category,
      justification: analysis.justification,
      metrics: normalizedMetrics,
      risks: analysis.risks,
      lastUpdate: new Date().toISOString(),
    };

    if (analysis.category === "opportunity") {
      opportunities.push(stockData);
    } else {
      alerts.push(stockData);
    }
  }

  // Ordena oportunidades por score (decrescente)
  opportunities.sort((a, b) => b.score - a.score);

  // Ordena alertas por score (crescente - piores primeiro)
  alerts.sort((a, b) => a.score - b.score);

  return { opportunities, alerts };
}

function hasEnoughStocksToPersist(radarData: RadarData): boolean {
  const totalStocks = radarData.opportunities.length + radarData.alerts.length;
  return totalStocks >= 5;
}

/**
 * Executa a atualização do radar
 */
export async function updateRadar(): Promise<{
  success: boolean;
  message: string;
  data?: RadarData;
}> {
  console.log("=== Iniciando atualização do radar ===");
  const cachedRadar = safeReadCurrentRadar();

  try {
    // Verifica se é permitido atualizar
    if (!isUpdateAllowed()) {
      const timeUntilNextUpdate = getTimeUntilNextUpdate();
      const hoursWait = (timeUntilNextUpdate / (1000 * 60 * 60)).toFixed(1);
      const message = `Cache válido. Próxima atualização em ${hoursWait}h`;
      logStep(message);
      return {
        success: true,
        message,
        data: cachedRadar,
      };
    }

    // Busca dados
    logStep("Buscando dados de acoes...");
    let stocksData = await fetchStockData();
    const fallbackStocks = buildFallbackAnalysisStocks(cachedRadar);
    if (stocksData.length === 0) {
      if (cachedRadar) {
        return buildSafeFallbackResponse(
          cachedRadar,
          "Nenhum dado novo foi obtido via MCP. Mantendo radar atual sem sobrescrever arquivos."
        );
      }

      logStep("Sem cache valido. Aplicando mocks internos como fallback final.");
      stocksData = MOCK_STOCKS;
    } else {
      stocksData = mergeWithFallbackStocks(stocksData, fallbackStocks);
      logStep(`${stocksData.length} acoes disponiveis apos merge com fallback local.`);
    }

    // Analisa
    logStep(`Analisando ${stocksData.length} acoes...`);
    const { opportunities, alerts } = analyzeStocks(stocksData);
    if (opportunities.length === 0 && alerts.length === 0) {
      return buildSafeFallbackResponse(
        cachedRadar,
        "Análise vazia. Mantendo radar atual sem sobrescrever arquivos."
      );
    }

    // Cria dados do radar
    const now = new Date().toISOString();
    const radarData: RadarData = {
      opportunities,
      alerts,
      lastUpdate: now,
      updateStatus: "automatic",
    };

    if (!hasEnoughStocksToPersist(radarData)) {
      return buildSafeFallbackResponse(
        cachedRadar,
        "Resultado insuficiente para persistencia. Mantendo radar atual sem sobrescrever arquivos."
      );
    }

    let finalRadarData = radarData;
    if (isGeminiConfigured()) {
      logStep("Gemini habilitado. Iniciando enriquecimento textual opcional...");
      finalRadarData = await enrichRadarWithGemini(radarData);
    } else {
      logStep("Gemini desabilitado. Mantendo justificativas locais.");
    }

    // Atualiza meta
    const nextUpdateTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const meta: RadarMeta = {
      lastUpdateTime: now,
      nextUpdateTime: nextUpdateTime.toISOString(),
      updateInterval: 24,
      source: isGeminiConfigured() ? "mcp+gemini+fallback" : "mcp+fallback",
      cacheValid: true,
    };

    // Salva dados
    logStep(
      `Persistindo radar com ${finalRadarData.opportunities.length} oportunidades e ${finalRadarData.alerts.length} alertas`
    );
    writeRadar(finalRadarData);
    writeRadarMeta(meta);

    console.log("=== Atualização concluída com sucesso ===");
    console.log(`✓ ${opportunities.length} oportunidades`);
    console.log(`✓ ${alerts.length} alertas`);

    return {
      success: true,
      message: "Radar atualizado com sucesso",
      data: finalRadarData,
    };
  } catch (error) {
    console.error("Erro ao atualizar radar:", error);
    return buildSafeFallbackResponse(
      cachedRadar,
      `Erro: ${error instanceof Error ? error.message : "Desconhecido"}`
    );
  }
}

function safeReadCurrentRadar(): RadarData | undefined {
  try {
    return readRadar();
  } catch {
    return undefined;
  }
}

function buildSafeFallbackResponse(
  cachedRadar: RadarData | undefined,
  message: string
): {
  success: boolean;
  message: string;
  data?: RadarData;
} {
  if (cachedRadar) {
    logStep(`${message} Cache atual preservado.`);
    return {
      success: true,
      message,
      data: cachedRadar,
    };
  }

  logStep(`${message} Nenhum cache valido disponivel.`);
  return {
    success: false,
    message,
  };
}

/**
 * Retorna tempo até próxima atualização (em ms)
 */
function getTimeUntilNextUpdate(): number {
  try {
    const meta = readRadarMeta();
    const nextUpdate = new Date(meta.nextUpdateTime).getTime();
    const now = new Date().getTime();
    return Math.max(0, nextUpdate - now);
  } catch {
    return 0;
  }
}

// Executa se for chamado diretamente
if (require.main === module) {
  updateRadar()
    .then((result) => {
      console.log(result.message);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Erro fatal:", error);
      process.exit(1);
    });
}
