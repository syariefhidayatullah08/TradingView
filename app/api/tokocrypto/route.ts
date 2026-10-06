import type { NextRequest } from "next/server";
import { denyUnlessAllowed } from "@/lib/access";
import { COINS } from "@/lib/symbols";

// Best bid/ask of the coin's IDR pair on Tokocrypto.
export async function GET(request: NextRequest) {
  const denied = await denyUnlessAllowed();
  if (denied) return denied;

  const base = request.nextUrl.searchParams.get("base");
  const coin = COINS.find((c) => c.base === base);
  if (!coin || !coin.tokoIdr) {
    return Response.json({ error: "Pasangan IDR tidak tersedia" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `https://www.tokocrypto.com/open/v1/market/depth?symbol=${coin.base}_IDR&limit=5`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 10 } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const bid = Number(json?.data?.bids?.[0]?.[0]);
    const ask = Number(json?.data?.asks?.[0]?.[0]);
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) throw new Error("Respons tidak valid");
    return Response.json({ bid, ask });
  } catch {
    return Response.json({ error: "Harga Tokocrypto gagal dimuat" }, { status: 502 });
  }
}
