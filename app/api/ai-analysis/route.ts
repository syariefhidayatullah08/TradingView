import type { NextRequest } from "next/server";
import { getAiAnalysis } from "@/lib/ai-analysis";
import { COINS } from "@/lib/symbols";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const coin = COINS.find((c) => c.symbol === symbol);
  if (!coin) {
    return Response.json({ error: "Koin tidak dikenal" }, { status: 400 });
  }
  try {
    return Response.json(await getAiAnalysis(coin));
  } catch (e) {
    console.error("AI analysis failed", coin.symbol, e);
    return Response.json({ error: "Analisa AI gagal dibuat. Coba lagi beberapa saat." }, { status: 502 });
  }
}
