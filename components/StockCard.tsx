"use client";

import { Stock } from "@/lib/types";
import styles from "./StockCard.module.css";

interface StockCardProps {
  stock: Stock;
  rank?: number;
}

export default function StockCard({ stock, rank }: StockCardProps) {
  const scoreColor = getScoreColor(stock.score);
  const riskText = stock.risks && stock.risks.length > 0 ? stock.risks[0] : null;

  return (
    <div className={`${styles.card} ${styles[stock.category]}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {rank && <span className={styles.rank}>#{rank}</span>}
          <div>
            <h3 className={styles.ticker}>{stock.ticker}</h3>
            <p className={styles.name}>{stock.name}</p>
          </div>
        </div>
        <div className={`${styles.score} ${styles[scoreColor]}`}>
          {stock.score.toFixed(1)}
        </div>
      </div>

      <p className={styles.justification}>{stock.justification}</p>

      {riskText && <p className={styles.risk}>⚠️ {riskText}</p>}

      <div className={styles.metrics}>
        {stock.metrics.dy !== undefined && (
          <div className={styles.metric}>
            <span className={styles.label}>DY</span>
            <span className={styles.value}>{stock.metrics.dy.toFixed(2)}%</span>
          </div>
        )}
        {stock.metrics.pb !== undefined && (
          <div className={styles.metric}>
            <span className={styles.label}>P/B</span>
            <span className={styles.value}>{stock.metrics.pb.toFixed(2)}</span>
          </div>
        )}
        {stock.metrics.pe !== undefined && stock.metrics.pe !== null && (
          <div className={styles.metric}>
            <span className={styles.label}>P/E</span>
            <span className={styles.value}>{stock.metrics.pe.toFixed(1)}</span>
          </div>
        )}
        {stock.metrics.roe !== undefined && (
          <div className={styles.metric}>
            <span className={styles.label}>ROE</span>
            <span className={styles.value}>{stock.metrics.roe.toFixed(1)}%</span>
          </div>
        )}
        {stock.metrics.debt !== undefined && (
          <div className={styles.metric}>
            <span className={styles.label}>Dívida</span>
            <span className={styles.value}>{stock.metrics.debt.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 8) return "excellent";
  if (score >= 6) return "good";
  if (score >= 4) return "warning";
  return "critical";
}
