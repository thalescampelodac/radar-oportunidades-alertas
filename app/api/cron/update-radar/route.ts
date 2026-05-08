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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): NextResponse | null {
  if (!CRON_SECRET) {
    return null;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.substring(7);
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  return null;
}

async function runUpdate(request: NextRequest) {
  const unauthorized = isAuthorized(request);
  if (unauthorized) {
    return unauthorized;
  }

  const result = await updateRadar();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  try {
    return await runUpdate(request);
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
 * GET para cron do Vercel e também para smoke test local.
 */
export async function GET(request: NextRequest) {
  try {
    return await runUpdate(request);
  } catch (error) {
    console.error("Error in update-radar cron GET:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
