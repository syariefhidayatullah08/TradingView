import { denyUnlessAllowed } from "@/lib/access";
import { getSahamReport } from "@/lib/saham-server";

export async function GET() {
  const denied = await denyUnlessAllowed();
  if (denied) return denied;

  try {
    const data = await getSahamReport();
    if (data.stocks.length === 0) {
      return Response.json({ error: "Data saham gagal dimuat dari Yahoo Finance" }, { status: 502 });
    }
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Gagal memuat data saham" }, { status: 502 });
  }
}
