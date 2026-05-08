import { NextResponse } from "next/server";
import { readRadar, readRadarMeta } from "@/lib/radar-storage";
import { RadarData, RadarMeta } from "@/lib/types";

export const revalidate = 3600; // Revalidate a cada hora

function buildFallbackRadar(): { data: RadarData; meta: RadarMeta } {
  const now = new Date();
  const nextUpdate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return {
    data: {
      opportunities: [],
      alerts: [],
      lastUpdate: now.toISOString(),
      updateStatus: "automatic",
    },
    meta: {
      lastUpdateTime: now.toISOString(),
      nextUpdateTime: nextUpdate.toISOString(),
      updateInterval: 24,
      source: "api-fallback",
      cacheValid: false,
    },
  };
}

export async function GET() {
  try {
    const radar = readRadar();
    const meta = readRadarMeta();

    return NextResponse.json({
      data: radar,
      meta: meta,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API /api/radar] Error reading radar data:", error);
    const fallback = buildFallbackRadar();

    return NextResponse.json(
      {
        data: fallback.data,
        meta: fallback.meta,
        timestamp: new Date().toISOString(),
        warning: "Radar indisponivel no disco. Retornando payload seguro vazio.",
      },
      { status: 200 }
    );
  }
}
