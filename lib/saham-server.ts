import { atr, emaSeries, macd, rsi, stochastic, type Candle, type Signal } from "./indicators";
import {
  STOCKS,
  TECH_WEIGHT,
  type Horizon,
  type MarketContext,
  type Point,
  type SahamChart,
  type SahamReport,
  type StockScore,
} from "./saham";
import { stockDecision } from "./saham-signals";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const CACHE_MS = 30 * 60_000;
let report: { at: number; data: SahamReport } | null = null;
let pending: Promise<SahamReport> | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function dailyCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`,
    { headers: UA },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()).chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) return [];
  const out: Candle[] = [];
  r.timestamp.forEach((t: number, i: number) => {
    const [o, h, l, c, v] = [q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i]];
    if ([o, h, l, c].every((x) => typeof x === "number" && x > 0)) {
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: v ?? 0 });
    }
  });
  return out;
}

// Yahoo's fundamentals endpoint needs a session cookie plus a matching "crumb" token.
let session: { cookie: string; crumb: string; at: number } | null = null;

async function yahooSession(fresh = false) {
  if (session && !fresh && Date.now() - session.at < 6 * 3600_000) return session;
  const home = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
  const cookie = home.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const res = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...UA, Cookie: cookie },
  });
  const crumb = await res.text();
  if (!res.ok || !crumb || crumb.includes("<")) throw new Error("Sesi Yahoo gagal");
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function summary(symbol: string): Promise<any | null> {
  for (const fresh of [false, true]) {
    const s = await yahooSession(fresh);
    const res = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=financialData,defaultKeyStatistics,summaryDetail&crumb=${encodeURIComponent(s.crumb)}`,
      { headers: { ...UA, Cookie: s.cookie } },
    );
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    return (await res.json()).quoteSummary?.result?.[0] ?? null;
  }
  return null;
}

function raw(v: any): number | null {
  const n = v && typeof v === "object" ? v.raw : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const lastOf = (s: number[]) => {
  const v = s[s.length - 1];
  return v === undefined || Number.isNaN(v) ? null : v;
};
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const avgTone = (pts: Point[]) => (pts.length ? pts.reduce((a, p) => a + p.tone, 0) / pts.length : 0);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function ret(closes: number[], days: number): number | null {
  return closes.length > days ? pct(closes[closes.length - 1], closes[closes.length - 1 - days]) : null;
}

// Weekly closes taken every 5 trading days, counting back from the latest candle.
function weekly(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = closes.length - 1; i >= 0; i -= 5) out.unshift(closes[i]);
  return out;
}

function technical(candles: Candle[], index: number[] | null) {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const e20 = lastOf(emaSeries(closes, 20));
  const e50 = lastOf(emaSeries(closes, 50));
  const e200 = lastOf(emaSeries(closes, 200));
  const points: Record<Horizon, Point[]> = { pendek: [], menengah: [], panjang: [] };

  const r = rsi(closes);
  const rPrev = rsi(closes.slice(0, -3));
  if (r !== null) {
    const rising = rPrev !== null && r > rPrev;
    const tone: Signal = r < 30 ? 1 : r > 70 ? -1 : r < 55 && rising ? 1 : 0;
    points.pendek.push({
      label: "RSI 14 hari",
      value: r.toFixed(0),
      tone,
      note:
        r < 30
          ? "Jenuh jual, rawan memantul"
          : r > 70
            ? "Jenuh beli, rawan koreksi"
            : rising
              ? "Mulai menguat"
              : "Netral",
    });
  }
  const st = stochastic(candles);
  if (st) {
    points.pendek.push({
      label: "Stochastic",
      value: st.k.toFixed(0),
      tone: st.k < 20 ? 1 : st.k > 80 ? -1 : 0,
      note: st.k < 20 ? "Jenuh jual" : st.k > 80 ? "Jenuh beli" : "Netral",
    });
  }
  const m = macd(closes);
  const mPrev = macd(closes.slice(0, -1));
  if (m && mPrev) {
    const up = m.hist > mPrev.hist;
    points.pendek.push({
      label: "MACD harian",
      value: m.hist >= 0 ? "positif" : "negatif",
      tone: m.hist > 0 && up ? 1 : m.hist < 0 && !up ? -1 : 0,
      note: up ? "Momentum membaik" : "Momentum melemah",
    });
  }
  if (e20 !== null) {
    points.pendek.push({
      label: "Harga vs EMA 20",
      value: fmtPct(pct(price, e20)),
      tone: price > e20 ? 1 : -1,
      note: price > e20 ? "Di atas rata-rata 1 bulan" : "Di bawah rata-rata 1 bulan",
    });
  }
  const vols = candles.slice(-21, -1).map((c) => c.volume);
  const avgVol = vols.reduce((a, b) => a + b, 0) / (vols.length || 1);
  const today = candles[candles.length - 1];
  if (avgVol > 0 && today.volume > 1.5 * avgVol) {
    const up = today.close >= today.open;
    points.pendek.push({
      label: "Volume",
      value: `${(today.volume / avgVol).toFixed(1)}× rata-rata`,
      tone: up ? 1 : -1,
      note: up ? "Volume besar saat naik (akumulasi)" : "Volume besar saat turun (distribusi)",
    });
  }

  if (e50 !== null) {
    points.menengah.push({
      label: "Harga vs EMA 50",
      value: fmtPct(pct(price, e50)),
      tone: price > e50 ? 1 : -1,
      note: price > e50 ? "Tren 2–3 bulan naik" : "Tren 2–3 bulan turun",
    });
  }
  if (e20 !== null && e50 !== null) {
    points.menengah.push({
      label: "EMA 20 vs EMA 50",
      value: e20 > e50 ? "di atas" : "di bawah",
      tone: e20 > e50 ? 1 : -1,
      note: e20 > e50 ? "Arah menengah menguat" : "Arah menengah melemah",
    });
  }
  const r3 = ret(closes, 63);
  if (r3 !== null) {
    points.menengah.push({
      label: "Kinerja 3 bulan",
      value: fmtPct(r3),
      tone: r3 > 5 ? 1 : r3 < -10 ? -1 : 0,
      note: "Perubahan harga ±63 hari bursa",
    });
  }
  const wm = macd(weekly(closes));
  if (wm) {
    points.menengah.push({
      label: "MACD mingguan",
      value: wm.hist >= 0 ? "positif" : "negatif",
      tone: wm.hist > 0 ? 1 : -1,
      note: wm.hist > 0 ? "Momentum mingguan naik" : "Momentum mingguan turun",
    });
  }
  const i3 = index ? ret(index, 63) : null;
  if (r3 !== null && i3 !== null) {
    const rel = r3 - i3;
    points.menengah.push({
      label: "Kekuatan vs IHSG",
      value: fmtPct(rel),
      tone: rel > 3 ? 1 : rel < -5 ? -1 : 0,
      note: rel > 0 ? "Lebih kuat dari indeks 3 bulan ini" : "Lebih lemah dari indeks 3 bulan ini",
    });
  }

  if (e200 !== null) {
    points.panjang.push({
      label: "Harga vs EMA 200",
      value: fmtPct(pct(price, e200)),
      tone: price > e200 ? 1 : -1,
      note: price > e200 ? "Tren besar naik" : "Tren besar turun",
    });
  }
  if (e50 !== null && e200 !== null) {
    points.panjang.push({
      label: "EMA 50 vs EMA 200",
      value: e50 > e200 ? "Golden cross" : "Death cross",
      tone: e50 > e200 ? 1 : -1,
      note: e50 > e200 ? "Struktur jangka panjang sehat" : "Struktur jangka panjang lemah",
    });
  }
  const r12 = ret(closes, 250);
  if (r12 !== null) {
    points.panjang.push({
      label: "Kinerja 1 tahun",
      value: fmtPct(r12),
      tone: r12 > 10 ? 1 : r12 < -20 ? -1 : 0,
      note: "Perubahan harga ±250 hari bursa",
    });
  }
  const hi = Math.max(...closes.slice(-250));
  const dd = pct(price, hi);
  points.panjang.push({
    label: "Jarak dari puncak 52 minggu",
    value: fmtPct(dd),
    // A deep discount only helps when the business is sound; scored neutral here.
    tone: 0,
    note: dd < -30 ? "Diskon besar dari puncak setahun" : "Dekat puncak setahun",
  });

  return {
    price,
    changePct: pct(price, closes[closes.length - 2]),
    ema50: e50,
    atr: atr(candles),
    avgValue: candles.slice(-20).reduce((a, c) => a + c.close * c.volume, 0) / Math.min(20, candles.length),
    points,
  };
}

function fundamental(s: any): {
  points: Point[];
  score: number | null;
  target: number | null;
  analysts: number | null;
} {
  if (!s) return { points: [], score: null, target: null, analysts: null };
  const fd = s.financialData ?? {};
  const ks = s.defaultKeyStatistics ?? {};
  const sd = s.summaryDetail ?? {};
  const idr = (fd.financialCurrency ?? "IDR") === "IDR";
  const pts: Point[] = [];
  const add = (
    label: string,
    v: number | null,
    value: (v: number) => string,
    tone: (v: number) => Signal,
    note: (v: number) => string,
  ) => {
    if (v !== null) pts.push({ label, value: value(v), tone: tone(v), note: note(v) });
  };
  const p100 = (v: number) => `${(v * 100).toFixed(1)}%`;

  add(
    "PER (harga/laba)",
    raw(sd.trailingPE),
    (v) => `${v.toFixed(1)}×`,
    (v) => (v < 12 ? 1 : v > 25 ? -1 : 0),
    (v) => (v < 12 ? "Murah dibanding labanya" : v > 25 ? "Mahal dibanding labanya" : "Wajar"),
  );
  // Book value is reported in USD for some miners, which makes Yahoo's PBV meaningless.
  const pbv = raw(ks.priceToBook);
  add(
    "PBV (harga/nilai buku)",
    idr && pbv !== null && pbv < 50 ? pbv : null,
    (v) => `${v.toFixed(2)}×`,
    (v) => (v < 1.5 ? 1 : v > 4 ? -1 : 0),
    (v) => (v < 1 ? "Di bawah nilai bukunya" : v > 4 ? "Mahal dibanding asetnya" : "Wajar"),
  );
  add(
    "ROE (laba/modal)",
    raw(fd.returnOnEquity),
    p100,
    (v) => (v > 0.15 ? 1 : v < 0.08 ? -1 : 0),
    (v) =>
      v > 0.15 ? "Sangat efisien menghasilkan laba" : v < 0.08 ? "Laba kecil dibanding modal" : "Cukup",
  );
  add(
    "Utang/ekuitas",
    raw(fd.debtToEquity),
    (v) => `${v.toFixed(0)}%`,
    (v) => (v < 60 ? 1 : v > 150 ? -1 : 0),
    (v) => (v < 60 ? "Utang rendah" : v > 150 ? "Utang tinggi" : "Utang sedang"),
  );
  add(
    "Pertumbuhan laba",
    raw(fd.earningsGrowth),
    p100,
    (v) => (v > 0.1 ? 1 : v < -0.1 ? -1 : 0),
    () => "Dibanding periode yang sama tahun lalu",
  );
  add(
    "Pertumbuhan pendapatan",
    raw(fd.revenueGrowth),
    p100,
    (v) => (v > 0.05 ? 1 : v < -0.05 ? -1 : 0),
    () => "Dibanding periode yang sama tahun lalu",
  );
  add(
    "Margin laba bersih",
    raw(fd.profitMargins),
    p100,
    (v) => (v > 0.15 ? 1 : v < 0.03 ? -1 : 0),
    (v) => (v > 0.15 ? "Margin tebal" : v < 0.03 ? "Margin tipis" : "Margin sedang"),
  );
  add(
    "Dividen",
    raw(sd.dividendYield),
    p100,
    (v) => (v > 0.05 ? 1 : 0),
    (v) => (v > 0.05 ? "Dividen tinggi (cek apakah berkelanjutan)" : "Dividen biasa"),
  );
  const price = raw(fd.currentPrice);
  const target = raw(fd.targetMeanPrice);
  const analysts = raw(fd.numberOfAnalystOpinions);
  if (price && target && (analysts ?? 0) >= 3) {
    const up = pct(target, price);
    pts.push({
      label: "Target analis",
      value: fmtPct(up),
      tone: up > 20 ? 1 : up < 0 ? -1 : 0,
      note: `Rata-rata ${analysts} analis`,
    });
  }
  return { points: pts, score: pts.length >= 4 ? avgTone(pts) : null, target, analysts };
}

async function pool<T, R>(items: readonly T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function marketContext(candles: Candle[]): MarketContext | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const e50 = lastOf(emaSeries(closes, 50));
  const e200 = lastOf(emaSeries(closes, 200));
  const change5d = ret(closes, 5) ?? 0;
  const drawdown = pct(price, Math.max(...closes.slice(-250)));
  const regime: MarketContext["regime"] =
    (e200 !== null && price < e200) || change5d < -7
      ? "turun"
      : e50 !== null && e200 !== null && price > e50 && e50 > e200
        ? "naik"
        : "netral";
  const note =
    regime === "turun"
      ? "IHSG sedang turun tajam / di bawah tren besarnya. Beli bertahap (separuh dulu), simpan kas, dan disiplin stop loss."
      : regime === "naik"
        ? "IHSG dalam tren naik. Kondisi mendukung untuk membeli sesuai rencana."
        : "IHSG bergerak datar. Pilih saham yang lebih kuat dari indeks.";
  return {
    price,
    changePct: pct(price, closes[closes.length - 2]),
    change5d,
    ema50: e50,
    ema200: e200,
    drawdown,
    regime,
    note,
  };
}

async function build(): Promise<SahamReport> {
  const ihsg = await dailyCandles("^JKSE").catch(() => []);
  const index = ihsg.length ? ihsg.map((c) => c.close) : null;
  const rows = await pool(STOCKS, 6, async (st): Promise<StockScore | null> => {
    const sym = `${st.code}.JK`;
    const [candles, sum] = await Promise.all([
      dailyCandles(sym).catch(() => []),
      summary(sym).catch(() => null),
    ]);
    if (candles.length < 60) return null;
    const t = technical(candles, index);
    const f = fundamental(sum);
    const tech = {
      pendek: avgTone(t.points.pendek),
      menengah: avgTone(t.points.menengah),
      panjang: avgTone(t.points.panjang),
    };
    const combine = (h: Horizon) =>
      f.score === null ? tech[h] * TECH_WEIGHT[h] : tech[h] * TECH_WEIGHT[h] + f.score * (1 - TECH_WEIGHT[h]);
    return {
      code: st.code,
      name: st.name,
      sector: st.sector,
      price: t.price,
      changePct: t.changePct,
      avgValue: t.avgValue,
      atr: t.atr,
      ema50: t.ema50,
      targetMean: f.target,
      analysts: f.analysts,
      technical: tech,
      fundamental: f.score,
      scores: { pendek: combine("pendek"), menengah: combine("menengah"), panjang: combine("panjang") },
      techPoints: t.points,
      fundPoints: f.points,
      decision: stockDecision(candles, ihsg.length ? ihsg : null),
    };
  });
  return {
    updatedAt: Date.now(),
    market: marketContext(ihsg),
    stocks: rows.filter((r): r is StockScore => r !== null),
  };
}

export async function getSahamReport(): Promise<SahamReport> {
  if (report && Date.now() - report.at < CACHE_MS) return report.data;
  pending ??= build()
    .then((data) => {
      if (data.stocks.length) report = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// Yahoo interval and history range for each chart timeframe on the stock tab.
const CHART_TF: Record<string, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "3mo" },
  "1d": { interval: "1d", range: "2y" },
  "1wk": { interval: "1wk", range: "10y" },
  // Longer histories for the strategy test.
  "1h-2y": { interval: "60m", range: "730d" },
  "1d-5y": { interval: "1d", range: "5y" },
};

export const isChartTimeframe = (tf: string) => tf in CHART_TF;

const chartCache = new Map<string, { at: number; data: SahamChart }>();

// Candles (times in ms) plus the latest quote, cached briefly so many viewers share one request.
export async function getSahamChart(symbol: string, tf: string): Promise<SahamChart> {
  const key = `${symbol}:${tf}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.data;
  const { interval, range } = CHART_TF[tf];
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
    { headers: UA },
  );
  if (!res.ok) throw new Error(res.status === 404 ? "Kode saham tidak ditemukan" : `HTTP ${res.status}`);
  const r = (await res.json()).chart?.result?.[0];
  if (!r?.meta) throw new Error("Kode saham tidak ditemukan");
  const q = r.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  (r.timestamp ?? []).forEach((t: number, i: number) => {
    const [o, h, l, c, v] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]];
    if ([o, h, l, c].every((x) => typeof x === "number" && x > 0)) {
      candles.push({ time: t * 1000, open: o, high: h, low: l, close: c, volume: v ?? 0 });
    }
  });
  const m = r.meta;
  const price = raw(m.regularMarketPrice) ?? candles[candles.length - 1]?.close ?? 0;
  const prev = raw(m.previousClose) ?? raw(m.regularMarketPreviousClose) ?? raw(m.chartPreviousClose);
  const changePct = raw(m.regularMarketChangePercent) ?? (prev ? pct(price, prev) : 0);
  const data: SahamChart = {
    symbol,
    name: m.longName ?? m.shortName ?? symbol,
    price,
    changePct,
    dayHigh: raw(m.regularMarketDayHigh),
    dayLow: raw(m.regularMarketDayLow),
    volume: raw(m.regularMarketVolume),
    marketTime: (raw(m.regularMarketTime) ?? 0) * 1000,
    candles,
  };
  chartCache.set(key, { at: Date.now(), data });
  return data;
}
