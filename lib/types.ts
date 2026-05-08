export interface Stock {
  ticker: string;
  name: string;
  score: number; // 0 a 10
  category: "opportunity" | "alert";
  justification: string;
  educationalNote?: string;
  metrics: {
    dy?: number; // Dividend Yield %
    pb?: number; // Price to Book
    pe?: number | null; // Price to Earnings
    roe?: number; // Return on Equity %
    debt?: number; // Net Debt / Equity
    liquidez?: number; // Liquidity score
  };
  risks?: string[];
  lastUpdate: string; // ISO date
}

export interface RadarData {
  opportunities: Stock[];
  alerts: Stock[];
  summary?: string;
  educationalNote?: string;
  geminiEnriched?: boolean;
  lastUpdate: string; // ISO date
  updateStatus: "automatic" | "manual";
}

export interface RadarMeta {
  lastUpdateTime: string; // ISO date
  nextUpdateTime: string; // ISO date
  updateInterval: number; // hours (default: 24)
  source: string;
  cacheValid: boolean;
}
