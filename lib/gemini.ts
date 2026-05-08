/**
 * Módulo para integração com Gemini API
 * Este módulo é chamado apenas no backend/server, nunca no frontend.
 * Nunca exponha GEMINI_API_KEY no frontend.
 *
 * Uso: Será acionado apenas 1 vez a cada 24 horas pelo job de atualização.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash"; // Usar model gratuito

interface GeminiAnalysisInput {
  ticker: string;
  name: string;
  fundamentals: Record<string, number | string | null>;
}

interface GeminiAnalysisOutput {
  score: number;
  justification: string;
  category: "opportunity" | "alert";
  risks?: string[];
}

/**
 * Chama Gemini para analisar uma ação
 * IMPORTANTE: Este método deve ser chamado APENAS no servidor/backend
 * Nunca na API pública ou no frontend
 */
export async function analyzeStockWithGemini(
  input: GeminiAnalysisInput
): Promise<GeminiAnalysisOutput> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY não configurado. Configure a variável de ambiente."
    );
  }

  const prompt = `
Você é um analista de ações brasileiro. Analise a ação ${input.ticker} (${input.name}) com os seguintes fundamentos:

${JSON.stringify(input.fundamentals, null, 2)}

Retorne uma análise em JSON com:
- score: número de 0 a 10 (10 = melhor oportunidade)
- category: "opportunity" ou "alert"
- justification: uma frase explicando o score
- risks: array com até 3 riscos principais (ou vazio se oportunidade)

Seja conservador. Considere:
- P/B < 1.0 como positivo
- DY > 4% como positivo para oportunidades
- P/E alto como negativo
- ROE > 15% como positivo
- Dívida > 2.0 como alerta

Responda apenas com JSON válido.
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("Resposta vazia do Gemini");
    }

    const content = data.candidates[0].content.parts[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Não conseguiu extrair JSON da resposta do Gemini");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      score: Math.min(10, Math.max(0, analysis.score || 5)),
      justification: analysis.justification || "Análise baseada em fundamentos",
      category: analysis.category || "alert",
      risks: analysis.risks || [],
    };
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    throw error;
  }
}

/**
 * Batch analyze multiple stocks (com controle de rate limit)
 */
export async function analyzeMultipleStocks(
  stocks: GeminiAnalysisInput[],
  delayMs: number = 1000
): Promise<GeminiAnalysisOutput[]> {
  const results: GeminiAnalysisOutput[] = [];

  for (const stock of stocks) {
    try {
      const analysis = await analyzeStockWithGemini(stock);
      results.push(analysis);

      // Delay para não estourar rate limit do Gemini free tier
      if (stocks.indexOf(stock) < stocks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Erro ao analisar ${stock.ticker}:`, error);
      // Retorna análise padrão em caso de erro
      results.push({
        score: 5,
        justification: "Análise não disponível",
        category: "alert",
        risks: ["Falha na análise"],
      });
    }
  }

  return results;
}
