/**
 * Camada opcional de enriquecimento textual com Gemini.
 *
 * Regras locais continuam sendo a fonte de score e categoria.
 * Gemini apenas melhora:
 * - justificativas
 * - resumo textual do radar
 * - observacoes educativas
 */

import { RadarData, Stock } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1beta";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 8000);

interface GeminiStockPayload {
  ticker: string;
  justification?: string;
  educationalNote?: string;
}

interface GeminiRadarPayload {
  summary?: string;
  educationalNote?: string;
  stocks?: GeminiStockPayload[];
}

function logStep(message: string): void {
  console.log(`[Gemini] ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseJsonObjectFromText(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new Error("Nao foi possivel extrair JSON do retorno do Gemini");
  }

  return JSON.parse(objectMatch[0]);
}

function parseFallbackTextPayload(text: string): GeminiRadarPayload {
  const normalized = text.trim().replace(/\s+/g, " ");
  const segments = normalized
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return {
    summary: segments[0] || normalized,
    educationalNote: segments[1] || segments[0] || normalized,
    stocks: [],
  };
}

function isValidGeminiPayload(value: unknown): value is GeminiRadarPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  if (
    payload.summary !== undefined &&
    payload.summary !== null &&
    !isNonEmptyString(payload.summary)
  ) {
    return false;
  }

  if (
    payload.educationalNote !== undefined &&
    payload.educationalNote !== null &&
    !isNonEmptyString(payload.educationalNote)
  ) {
    return false;
  }

  if (payload.stocks !== undefined) {
    if (!Array.isArray(payload.stocks)) {
      return false;
    }

    for (const item of payload.stocks) {
      if (!item || typeof item !== "object") {
        return false;
      }

      const stock = item as Record<string, unknown>;
      if (!isNonEmptyString(stock.ticker)) {
        return false;
      }

      if (stock.justification !== undefined && stock.justification !== null && !isNonEmptyString(stock.justification)) {
        return false;
      }

      if (stock.educationalNote !== undefined && stock.educationalNote !== null && !isNonEmptyString(stock.educationalNote)) {
        return false;
      }
    }
  }

  return true;
}

function compactMetrics(stock: Stock): Record<string, number | null | undefined> {
  return {
    dy: stock.metrics.dy,
    pb: stock.metrics.pb,
    pe: stock.metrics.pe,
    roe: stock.metrics.roe,
    debt: stock.metrics.debt,
    liquidez: stock.metrics.liquidez,
  };
}

function buildPrompt(radarData: RadarData): string {
  const stocks = [...radarData.opportunities, ...radarData.alerts].map((stock) => ({
    t: stock.ticker,
    n: stock.name,
    s: Number(stock.score.toFixed(1)),
    c: stock.category,
    j: stock.justification,
    m: compactMetrics(stock),
  }));

  return [
    "Voce produz texto educacional curto sobre acoes brasileiras.",
    "NAO altere score nem categoria. Apenas reescreva justificativas e gere observacoes educativas.",
    "Retorne JSON valido no formato:",
    '{"summary":"string curta","educationalNote":"string curta","stocks":[{"ticker":"PETR4","justification":"string curta","educationalNote":"string curta"}]}',
    "Limites:",
    "- summary com no maximo 180 caracteres",
    "- educationalNote com no maximo 180 caracteres",
    "- justification por ativo com no maximo 140 caracteres",
    "- educationalNote por ativo com no maximo 120 caracteres",
    "- nao invente dados fora do payload",
    "- se nao tiver confianca, preserve o texto base",
    `Dados: ${JSON.stringify(stocks)}`,
  ].join("\n");
}

function trimText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trim()}…`
    : normalized;
}

function buildEndpoint(model: string, version: string): string {
  return `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;
}

async function callGemini(
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY || "",
    },
    body: JSON.stringify(body),
    signal,
  });
}

function buildResponseSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      summary: {
        type: "string",
      },
      educationalNote: {
        type: "string",
      },
      stocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            justification: { type: "string" },
            educationalNote: { type: "string" },
          },
          required: ["ticker"],
        },
      },
    },
    required: ["stocks"],
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export async function enrichRadarWithGemini(radarData: RadarData): Promise<RadarData> {
  if (!GEMINI_API_KEY) {
    logStep("GEMINI_API_KEY ausente. Pulando enriquecimento.");
    return radarData;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    logStep("Enviando lote unico ao Gemini para enriquecimento textual");

    const primaryEndpoint = buildEndpoint(GEMINI_MODEL, GEMINI_API_VERSION);
    const response = await callGemini(
      primaryEndpoint,
      {
        contents: [{ parts: [{ text: buildPrompt(radarData) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 650,
          responseMimeType: "application/json",
          responseJsonSchema: buildResponseSchema(),
        },
      },
      controller.signal
    );

    if (!response.ok) {
      throw new Error(
        `Gemini API ${response.status} ${response.statusText} | model=${GEMINI_MODEL} | version=${GEMINI_API_VERSION}`
      );
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!isNonEmptyString(text)) {
      throw new Error("Resposta vazia do Gemini");
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObjectFromText(text);
    } catch {
      logStep("Gemini retornou texto livre. Aplicando fallback textual aproveitando a resposta.");
      logStep(`Trecho bruto do Gemini: ${text.slice(0, 180).replace(/\s+/g, " ")}`);
      parsed = parseFallbackTextPayload(text);
    }

    if (!isValidGeminiPayload(parsed)) {
      throw new Error("JSON do Gemini invalido");
    }

    const payload = parsed as GeminiRadarPayload;
    const enrichments = new Map(
      (payload.stocks ?? []).map((item) => [item.ticker.toUpperCase(), item])
    );

    const mergeStock = (stock: Stock): Stock => {
      const enrichment = enrichments.get(stock.ticker.toUpperCase());

      return {
        ...stock,
        justification:
          trimText(enrichment?.justification, 140) ?? stock.justification,
        educationalNote:
          trimText(enrichment?.educationalNote, 120) ?? stock.educationalNote,
      };
    };

    const enrichedRadar: RadarData = {
      ...radarData,
      opportunities: radarData.opportunities.map(mergeStock),
      alerts: radarData.alerts.map(mergeStock),
      summary: trimText(payload.summary, 180) ?? radarData.summary,
      educationalNote:
        trimText(payload.educationalNote, 180) ?? radarData.educationalNote,
      geminiEnriched: true,
    };

    logStep("Enriquecimento textual concluido com sucesso");
    return enrichedRadar;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Gemini] Timeout apos ${GEMINI_TIMEOUT_MS}ms`);
    } else {
      console.error("[Gemini] Falha no enriquecimento:", error);
    }

    logStep("Fallback total para justificativas locais");
    return radarData;
  } finally {
    clearTimeout(timeoutId);
  }
}
