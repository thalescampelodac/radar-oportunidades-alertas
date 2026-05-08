"use client";

import { useEffect, useState } from "react";
import { RadarData, RadarMeta } from "@/lib/types";
import StockCard from "./StockCard";
import styles from "./Radar.module.css";

export default function Radar() {
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [meta, setMeta] = useState<RadarMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRadar = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/radar", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        setRadarData(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Error fetching radar:", err);
        setError(
          err instanceof Error ? err.message : "Erro ao carregar o radar"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchRadar();
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Carregando radar...</div>
      </div>
    );
  }

  if (error || !radarData) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          Erro: {error || "Dados do radar não encontrados"}
        </div>
      </div>
    );
  }

  const lastUpdateDate = new Date(radarData.lastUpdate);
  const lastUpdateFormatted = lastUpdateDate.toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={styles.container}>
      {/* Header do Radar */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>📊 Radar de Oportunidades e Alertas</h1>
          <p className={styles.subtitle}>
            Análise educacional de ações brasileiras baseada em fundamentos
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.updateInfo}>
            <span className={styles.status}>🔄 Atualização automática diária</span>
            <span className={styles.lastUpdate}>
              Última atualização: {lastUpdateFormatted}
            </span>
          </div>
        </div>
      </header>

      {/* Aviso Educacional */}
      <div className={styles.disclaimer}>
        <strong>⚠️ Aviso Importante:</strong> Este radar é apenas um instrumento
        educacional baseado em dados públicos e gratuitos. Não é uma recomendação
        de investimento. Sempre consulte um profissional qualificado antes de
        tomar decisões financeiras.
      </div>

      {/* Seção de Oportunidades */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            ✨ Oportunidades ({radarData.opportunities.length})
          </h2>
          <p className={styles.sectionDescription}>
            Ações com bons fundamentos e possível atratividade
          </p>
        </div>
        <div className={styles.grid}>
          {radarData.opportunities.map((stock, index) => (
            <StockCard key={stock.ticker} stock={stock} rank={index + 1} />
          ))}
        </div>
      </section>

      {/* Seção de Alertas */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            🚨 Alertas ({radarData.alerts.length})
          </h2>
          <p className={styles.sectionDescription}>
            Ações com sinais ruins ou risco elevado - evitar, acompanhar com
            cuidado ou desfazer
          </p>
        </div>
        <div className={styles.grid}>
          {radarData.alerts.map((stock, index) => (
            <StockCard key={stock.ticker} stock={stock} rank={index + 1} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>
          Dados coletados de fontes públicas e gratuitas. Atualização automática
          às {new Date(meta?.nextUpdateTime || new Date()).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </footer>
    </div>
  );
}
