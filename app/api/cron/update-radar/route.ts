import { NextRequest, NextResponse } from "next/server";
import { updateRadar } from "@/scripts/update-radar";

/**
 * Endpoint para acionar atualização do radar
 *
 * POST /api/cron/update-radar
 *
 * Segurança: Este endpoint pode ser protegido com:
 * - Header Authorization customizado
 * - CRON_SECRET environment variable
 * - IP whitelist (se usado via EasyCron, Vercel Cron, etc)
 */

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Verifica se tem secret configurado e valida
    if (CRON_SECRET) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      if (token !== CRON_SECRET) {
        return NextResponse.json(
          { error: "Invalid token" },
          { status: 403 }
        );
      }
    }

    // Executa atualização
    const result = await updateRadar();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in update-radar endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET para verificar status
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "Endpoint de atualização aguardando POST com CRON_SECRET",
    note: "Configure a variável CRON_SECRET no .env.local para usar este endpoint",
  });
}
