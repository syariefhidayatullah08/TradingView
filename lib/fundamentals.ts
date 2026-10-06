import type { Signal } from "./indicators";
import { COINGECKO_API, formatCompact } from "./symbols";

export type Fundamentals = {
  rank: number | null;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume: number | null;
  circulating: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athChangePct: number | null;
  athDate: string | null;
  atl: number | null;
  atlDate: string | null;
  change7d: number | null;
  change30d: number | null;
  change1y: number | null;
  genesisDate: string | null;
  algorithm: string | null;
  categories: string[];
  homepage: string | null;
  description: string;
  commits4w: number | null;
};

export type GlobalMarket = {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  ethDominance: number;
  change24h: number;
};

export type FundamentalPoint = { label: string; value: string; tone: Signal; note: string };

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

// CoinGecko's public API is rate limited per IP, so responses are memoised briefly.
async function cached<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
  const res = await fetch(`${COINGECKO_API}${path}`);
  if (res.status === 429) throw new Error("Batas permintaan CoinGecko tercapai, coba lagi sebentar");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(path, { at: Date.now(), data });
  return data as T;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchFundamentals(geckoId: string): Promise<Fundamentals> {
  const j = await cached<any>(
    `/coins/${geckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=true&sparkline=false`,
  );
  const m = j.market_data ?? {};
  const homepage = str(j.links?.homepage?.[0]);
  return {
    rank: num(j.market_cap_rank),
    price: num(m.current_price?.usd),
    marketCap: num(m.market_cap?.usd),
    fdv: num(m.fully_diluted_valuation?.usd),
    volume: num(m.total_volume?.usd),
    circulating: num(m.circulating_supply),
    totalSupply: num(m.total_supply),
    maxSupply: num(m.max_supply),
    ath: num(m.ath?.usd),
    athChangePct: num(m.ath_change_percentage?.usd),
    athDate: str(m.ath_date?.usd),
    atl: num(m.atl?.usd),
    atlDate: str(m.atl_date?.usd),
    change7d: num(m.price_change_percentage_7d),
    change30d: num(m.price_change_percentage_30d),
    change1y: num(m.price_change_percentage_1y),
    genesisDate: str(j.genesis_date),
    algorithm: str(j.hashing_algorithm),
    categories: Array.isArray(j.categories) ? j.categories.filter((c: unknown) => typeof c === "string") : [],
    homepage: homepage && /^https?:\/\//.test(homepage) ? homepage : null,
    description: String(j.description?.en ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    commits4w: num(j.developer_data?.commit_count_4_weeks),
  };
}

export async function fetchGlobal(): Promise<GlobalMarket> {
  const j = await cached<any>("/global");
  const d = j.data ?? {};
  return {
    totalMarketCap: Number(d.total_market_cap?.usd),
    totalVolume: Number(d.total_volume?.usd),
    btcDominance: Number(d.market_cap_percentage?.btc),
    ethDominance: Number(d.market_cap_percentage?.eth),
    change24h: Number(d.market_cap_change_percentage_24h_usd),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function pct(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function assess(f: Fundamentals): { points: FundamentalPoint[]; score: number } {
  const points: FundamentalPoint[] = [];

  if (f.rank !== null) {
    points.push({
      label: "Peringkat kapitalisasi",
      value: `#${f.rank}`,
      tone: f.rank <= 10 ? 1 : f.rank <= 50 ? 0 : -1,
      note:
        f.rank <= 10
          ? "Aset papan atas, relatif mapan"
          : f.rank <= 50
            ? "Kapitalisasi menengah"
            : "Kapitalisasi kecil, risiko lebih tinggi",
    });
  }

  if (f.volume !== null && f.marketCap) {
    const ratio = (f.volume / f.marketCap) * 100;
    points.push({
      label: "Volume 24j / Kapitalisasi",
      value: `${ratio.toFixed(2)}%`,
      tone: ratio >= 5 ? 1 : ratio >= 1 ? 0 : -1,
      note: ratio >= 5 ? "Likuiditas tinggi" : ratio >= 1 ? "Likuiditas wajar" : "Likuiditas rendah",
    });
  }

  if (f.marketCap && f.fdv) {
    const ratio = f.marketCap / f.fdv;
    points.push({
      label: "Kapitalisasi / FDV",
      value: ratio.toFixed(2),
      tone: ratio >= 0.85 ? 1 : ratio >= 0.5 ? 0 : -1,
      note:
        ratio >= 0.85
          ? "Hampir semua token sudah beredar, risiko dilusi rendah"
          : ratio >= 0.5
            ? "Sebagian token belum beredar"
            : "Banyak token belum beredar, risiko dilusi tinggi",
    });
  }

  points.push({
    label: "Batas suplai",
    value: f.maxSupply !== null ? formatCompact(f.maxSupply) : "Tidak ada",
    tone: f.maxSupply !== null ? 1 : 0,
    note: f.maxSupply !== null ? "Suplai maksimum terbatas" : "Suplai tidak dibatasi (bisa inflasi)",
  });

  if (f.athChangePct !== null) {
    points.push({
      label: "Jarak dari harga tertinggi (ATH)",
      value: pct(f.athChangePct),
      tone: f.athChangePct > -30 ? 1 : f.athChangePct > -80 ? 0 : -1,
      note:
        f.athChangePct > -30
          ? "Dekat puncak, minat pasar kuat"
          : f.athChangePct > -80
            ? "Masih di bawah puncak sebelumnya"
            : "Jauh di bawah puncak, minat pasar lemah",
    });
  }

  if (f.change30d !== null) {
    points.push({
      label: "Kinerja 30 hari",
      value: pct(f.change30d),
      tone: f.change30d > 10 ? 1 : f.change30d < -10 ? -1 : 0,
      note: f.change30d > 10 ? "Tren bulanan naik" : f.change30d < -10 ? "Tren bulanan turun" : "Bergerak mendatar",
    });
  }

  if (f.change1y !== null) {
    points.push({
      label: "Kinerja 1 tahun",
      value: pct(f.change1y),
      tone: f.change1y > 0 ? 1 : f.change1y < -30 ? -1 : 0,
      note: f.change1y > 0 ? "Naik dalam setahun" : f.change1y < -30 ? "Turun tajam dalam setahun" : "Sedikit turun dalam setahun",
    });
  }

  if (f.commits4w !== null) {
    points.push({
      label: "Aktivitas developer (4 minggu)",
      value: `${f.commits4w} commit`,
      tone: f.commits4w >= 50 ? 1 : f.commits4w >= 5 ? 0 : -1,
      note: f.commits4w >= 50 ? "Pengembangan aktif" : f.commits4w >= 5 ? "Pengembangan berjalan" : "Pengembangan sepi",
    });
  }

  const sum = points.reduce((a, p) => a + p.tone, 0);
  return { points, score: points.length ? sum / points.length : 0 };
}

export function fundamentalLabel(score: number): { text: string; tone: Signal } {
  if (score >= 0.4) return { text: "KUAT", tone: 1 };
  if (score <= -0.2) return { text: "LEMAH", tone: -1 };
  return { text: "CUKUP", tone: 0 };
}
