import type { NextRequest } from "next/server";
import { denyUnlessAllowed } from "@/lib/access";
import { getSahamChart, isChartTimeframe } from "@/lib/saham-server";

export async function GET(request: NextRequest) {
  const denied = await denyUnlessAllowed();
  if (denied) return denied;

  const code = (request.nextUrl.searchParams.get("code") ?? "IHSG").toUpperCase();
  const tf = request.nextUrl.searchParams.get("tf") ?? "5m";
  if (!/^[A-Z]{4}$|^IHSG$/.test(code)) return Response.json({ error: "Kode saham harus 4 huruf" }, { status: 400 });
  if (!isChartTimeframe(tf)) return Response.json({ error: "Timeframe tidak dikenal" }, { status: 400 });

  try {
    return Response.json(await getSahamChart(code === "IHSG" ? "^JKSE" : `${code}.JK`, tf));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Gagal memuat chart" }, { status: 502 });
  }
}
