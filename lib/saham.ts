import type { Signal } from "./indicators";

// Liquid IDX stocks (mostly LQ45 / IDX30 members) that a small account can trade daily.
export const STOCKS = [
  { code: "BBCA", name: "Bank Central Asia", sector: "Bank" },
  { code: "BBRI", name: "Bank Rakyat Indonesia", sector: "Bank" },
  { code: "BMRI", name: "Bank Mandiri", sector: "Bank" },
  { code: "BBNI", name: "Bank Negara Indonesia", sector: "Bank" },
  { code: "BRIS", name: "Bank Syariah Indonesia", sector: "Bank" },
  { code: "TLKM", name: "Telkom Indonesia", sector: "Telekomunikasi" },
  { code: "ISAT", name: "Indosat Ooredoo Hutchison", sector: "Telekomunikasi" },
  { code: "EXCL", name: "XLSmart Telecom", sector: "Telekomunikasi" },
  { code: "ASII", name: "Astra International", sector: "Otomotif & konglomerasi" },
  { code: "UNTR", name: "United Tractors", sector: "Alat berat & tambang" },
  { code: "ADRO", name: "Alamtri Resources", sector: "Batu bara" },
  { code: "PTBA", name: "Bukit Asam", sector: "Batu bara" },
  { code: "ITMG", name: "Indo Tambangraya Megah", sector: "Batu bara" },
  { code: "ANTM", name: "Aneka Tambang", sector: "Logam & emas" },
  { code: "MDKA", name: "Merdeka Copper Gold", sector: "Logam & emas" },
  { code: "INCO", name: "Vale Indonesia", sector: "Logam & emas" },
  { code: "AMMN", name: "Amman Mineral", sector: "Logam & emas" },
  { code: "ICBP", name: "Indofood CBP", sector: "Konsumer" },
  { code: "INDF", name: "Indofood Sukses Makmur", sector: "Konsumer" },
  { code: "MYOR", name: "Mayora Indah", sector: "Konsumer" },
  { code: "UNVR", name: "Unilever Indonesia", sector: "Konsumer" },
  { code: "SIDO", name: "Sido Muncul", sector: "Kesehatan" },
  { code: "KLBF", name: "Kalbe Farma", sector: "Kesehatan" },
  { code: "HEAL", name: "Medikaloka Hermina", sector: "Kesehatan" },
  { code: "CPIN", name: "Charoen Pokphand", sector: "Pakan & unggas" },
  { code: "JPFA", name: "Japfa Comfeed", sector: "Pakan & unggas" },
  { code: "AMRT", name: "Sumber Alfaria Trijaya", sector: "Ritel" },
  { code: "ACES", name: "Aspirasi Hidup Indonesia", sector: "Ritel" },
  { code: "MAPI", name: "Mitra Adiperkasa", sector: "Ritel" },
  { code: "CTRA", name: "Ciputra Development", sector: "Properti" },
  { code: "BSDE", name: "Bumi Serpong Damai", sector: "Properti" },
  { code: "PWON", name: "Pakuwon Jati", sector: "Properti" },
  { code: "SMGR", name: "Semen Indonesia", sector: "Semen" },
  { code: "INTP", name: "Indocement", sector: "Semen" },
  { code: "JSMR", name: "Jasa Marga", sector: "Infrastruktur" },
  { code: "PGAS", name: "Perusahaan Gas Negara", sector: "Energi" },
  { code: "MEDC", name: "Medco Energi", sector: "Energi" },
  { code: "AKRA", name: "AKR Corporindo", sector: "Energi" },
  { code: "GOTO", name: "GoTo Gojek Tokopedia", sector: "Teknologi" },
] as const;

export type Horizon = "pendek" | "menengah" | "panjang";

export const HORIZONS: { id: Horizon; label: string; hold: string }[] = [
  { id: "pendek", label: "Jangka pendek", hold: "1–4 minggu" },
  { id: "menengah", label: "Jangka menengah", hold: "1–6 bulan" },
  { id: "panjang", label: "Jangka panjang", hold: "1 tahun lebih" },
];

export type Point = { label: string; value: string; tone: Signal; note: string };

export type StockScore = {
  code: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  // Average daily traded value over 20 days, in rupiah.
  avgValue: number;
  atr: number | null;
  ema50: number | null;
  targetMean: number | null;
  analysts: number | null;
  technical: Record<Horizon, number>; // -1..1
  fundamental: number | null; // -1..1, null when data is unavailable
  scores: Record<Horizon, number>; // combined -1..1
  techPoints: Record<Horizon, Point[]>;
  fundPoints: Point[];
};

export type MarketContext = {
  price: number;
  changePct: number;
  change5d: number;
  ema50: number | null;
  ema200: number | null;
  drawdown: number; // % below 52-week high
  // "turun" = IHSG below its 200-day EMA or in a sharp sell-off; buy in stages only.
  regime: "naik" | "netral" | "turun";
  note: string;
};

export type SahamReport = { updatedAt: number; market: MarketContext | null; stocks: StockScore[] };

// Weight of technical vs fundamental analysis for each holding period.
export const TECH_WEIGHT: Record<Horizon, number> = { pendek: 0.8, menengah: 0.5, panjang: 0.25 };

export const BUY_FEE = 0.0015; // typical online broker buy fee
export const SELL_FEE = 0.0025; // sell fee including 0.1% final tax
export const LOT = 100;

// IDX price fractions (tick sizes) for regular-market stocks.
export function tickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

export function roundTick(price: number, dir: "up" | "down" = "down"): number {
  const t = tickSize(price);
  return (dir === "up" ? Math.ceil(price / t) : Math.floor(price / t)) * t;
}

export function verdict(score: number): { text: string; tone: Signal } {
  if (score >= 0.35) return { text: "BELI", tone: 1 };
  if (score >= 0.1) return { text: "CICIL / PANTAU", tone: 0 };
  if (score > -0.2) return { text: "TUNGGU", tone: 0 };
  return { text: "HINDARI", tone: -1 };
}

export const rupiah = (n: number) =>
  `Rp${Math.round(n).toLocaleString("id-ID")}`;

export type Pick = {
  stock: StockScore;
  horizon: Horizon;
  lots: number;
  cost: number; // including buy fee
  entry: number;
  stop: number | null;
  target: number | null;
  // Lots to buy now; the rest waits for a second entry when the market is falling.
  lotsNow: number;
};

export type Plan = { picks: Pick[]; cash: number; budgets: Record<Horizon, number> };

// Splits the budget across horizons, picks the best distinct stocks for each, and sizes whole lots.
export function buildPlan(
  stocks: StockScore[],
  budget: number,
  split: Record<Horizon, number>,
  market: MarketContext | null,
): Plan {
  const totalPct = split.pendek + split.menengah + split.panjang || 1;
  const budgets = {
    pendek: (budget * split.pendek) / totalPct,
    menengah: (budget * split.menengah) / totalPct,
    panjang: (budget * split.panjang) / totalPct,
  };
  const count: Record<Horizon, number> = { panjang: 3, menengah: 2, pendek: 2 };
  // Fewer short-term trades and a staged entry while the index is in a downtrend.
  if (market?.regime === "turun") count.pendek = 1;
  const used = new Set<string>();
  const sectors = new Map<string, number>();
  const picks: Pick[] = [];
  let cash = 0;

  for (const h of ["panjang", "menengah", "pendek"] as Horizon[]) {
    const minScore = h === "pendek" ? 0.35 : 0.2;
    const ranked = stocks
      .filter((s) => s.scores[h] >= minScore && !used.has(s.code))
      // Long holds must have proven fundamentals.
      .filter((s) => h !== "panjang" || (s.fundamental ?? -1) >= 0.2)
      // Every pick needs enough daily trading to get in and out; short trades need more,
      // and skip very cheap shares where a single tick is a big percentage move.
      .filter((s) => s.avgValue >= (h === "pendek" ? 20e9 : 5e9))
      .filter((s) => h !== "pendek" || (s.price >= 200 && (s.fundamental ?? 0) >= 0))
      .sort((a, b) => b.scores[h] - a.scores[h]);
    const chosen: StockScore[] = [];
    for (const s of ranked) {
      if (chosen.length >= count[h]) break;
      // Spread across sectors: one per sector within a horizon, two in the whole plan.
      if ((sectors.get(s.sector) ?? 0) >= 2 || chosen.some((c) => c.sector === s.sector)) continue;
      if (s.price * LOT * (1 + BUY_FEE) > budgets[h] / Math.max(1, count[h]) * 1.6) continue; // lot too expensive
      chosen.push(s);
      used.add(s.code);
      sectors.set(s.sector, (sectors.get(s.sector) ?? 0) + 1);
    }
    let left = budgets[h];
    chosen.forEach((s, i) => {
      const share = left / (chosen.length - i);
      const lotCost = s.price * LOT * (1 + BUY_FEE);
      const lots = Math.floor(share / lotCost);
      if (lots < 1) return;
      const cost = lots * lotCost;
      left -= cost;
      const atr = s.atr ?? s.price * 0.03;
      const stop =
        h === "pendek"
          ? roundTick(s.price - 1.5 * atr)
          : h === "menengah"
            ? roundTick(Math.min(s.price - 2.5 * atr, (s.ema50 ?? s.price) * 0.93))
            : null;
      const target =
        h === "pendek"
          ? roundTick(s.price + 3 * atr, "up")
          : s.targetMean && s.targetMean > s.price
            ? roundTick(h === "menengah" ? s.price + (s.targetMean - s.price) * 0.6 : s.targetMean, "up")
            : roundTick(s.price * (h === "menengah" ? 1.15 : 1.3), "up");
      const staged = market?.regime === "turun" && h !== "pendek";
      picks.push({
        stock: s,
        horizon: h,
        lots,
        cost,
        entry: s.price,
        stop,
        target,
        lotsNow: staged ? Math.max(1, Math.ceil(lots / 2)) : lots,
      });
    });
    cash += left;
  }
  return { picks, cash, budgets };
}
