/**
 * Regras para classificação de oportunidades e alertas
 * Baseado em fundamentos de ações brasileiras
 */

export interface FundamentalsAnalysis {
  score: number;
  category: "opportunity" | "alert";
  justification: string;
  risks?: string[];
}

/**
 * Analisa fundamentos para classificar como oportunidade ou alerta
 */
export function analyzeByRules(_ticker: string, metrics: {
  dy?: number;
  pb?: number;
  pe?: number | null;
  roe?: number;
  debt?: number;
  liquidez?: number;
}): FundamentalsAnalysis {
  let score = 5; // Score inicial
  const positives: string[] = [];
  const negatives: string[] = [];
  const availableMetrics = Object.values(metrics).filter(
    (value) => value !== undefined && value !== null
  ).length;

  // Análise de P/B (Price to Book)
  if (metrics.pb !== undefined) {
    if (metrics.pb < 0.7) {
      score += 2;
      positives.push("P/B muito baixo");
    } else if (metrics.pb < 1.0) {
      score += 1.5;
      positives.push("P/B atraente");
    } else if (metrics.pb > 2.5) {
      score -= 1.5;
      negatives.push("P/B elevado");
    }
  }

  // Análise de P/E (Price to Earnings)
  if (metrics.pe !== undefined && metrics.pe !== null && metrics.pe > 0) {
    if (metrics.pe < 10) {
      score += 1;
      positives.push("P/E baixo");
    } else if (metrics.pe > 20) {
      score -= 0.5;
      negatives.push("P/E elevado");
    }
  } else if (metrics.pe === null || (metrics.pe !== undefined && metrics.pe <= 0)) {
    score -= 1.5;
    negatives.push("Sem lucro (P/E indefinido)");
  }

  // Análise de Dividend Yield
  if (metrics.dy !== undefined) {
    if (metrics.dy > 5) {
      score += 1.5;
      positives.push("Rendimento atrativo");
    } else if (metrics.dy > 3) {
      score += 0.5;
      positives.push("Rendimento moderado");
    } else if (metrics.dy < 0.5) {
      score -= 0.5;
      negatives.push("Sem dividendos");
    }
  }

  // Análise de ROE (Return on Equity)
  if (metrics.roe !== undefined) {
    if (metrics.roe > 20) {
      score += 1.5;
      positives.push("ROE excelente");
    } else if (metrics.roe > 15) {
      score += 1;
      positives.push("ROE bom");
    } else if (metrics.roe > 5) {
      score += 0.5;
    } else if (metrics.roe < 0) {
      score -= 2;
      negatives.push("ROE negativo");
    } else {
      score -= 0.5;
      negatives.push("ROE baixo");
    }
  }

  // Análise de Dívida (Net Debt / Equity)
  if (metrics.debt !== undefined) {
    if (metrics.debt < 0.5) {
      score += 1;
      positives.push("Endividamento baixo");
    } else if (metrics.debt > 3) {
      score -= 2;
      negatives.push("Endividamento crítico");
    } else if (metrics.debt > 2) {
      score -= 1.5;
      negatives.push("Endividamento alto");
    }
  }

  // Análise de Liquidez
  if (metrics.liquidez !== undefined) {
    if (metrics.liquidez < 4) {
      score -= 1;
      negatives.push("Liquidez baixa");
    }
  }

  if (availableMetrics < 3) {
    score -= 1;
    negatives.push("Dados fundamentalistas incompletos");
  }

  // Normaliza score entre 0 e 10
  score = Math.min(10, Math.max(0, score));

  // Determina categoria
  const category = score >= 6.5 ? "opportunity" : "alert";

  // Cria justificativa
  let justification = "";
  if (positives.length > 0) {
    justification = positives[0];
    if (positives.length > 1) {
      justification += `, ${positives[1]}`;
    }
  }

  if (negatives.length > 0) {
    if (justification) {
      justification += `. Atenção: ${negatives[0]}`;
    } else {
      justification = negatives[0];
    }
  }

  if (!justification) {
    justification =
      category === "opportunity"
        ? "Fundamentos razoáveis"
        : "Necessita acompanhamento";
  }

  return {
    score,
    category,
    justification,
    risks: negatives.length > 0 ? negatives : undefined,
  };
}
