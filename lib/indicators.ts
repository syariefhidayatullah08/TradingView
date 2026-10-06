export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Volume bought by market (taker) buyers; the rest was market sells.
  takerBuyVolume?: number;
};

export type Signal = -1 | 0 | 1;

export type IndicatorRow = {
  name: string;
  value: string;
  signal: Signal;
  note: string;
};

export type Analysis = {
  price: number;
  changePct: number;
  rows: IndicatorRow[];
  score: number; // -1 (jual kuat) .. 1 (beli kuat)
  buy: number;
  sell: number;
  neutral: number;
  atr: number | null;
  pivots: { r2: number; r1: number; p: number; s1: number; s2: number } | null;
};

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// EMA seeded with the SMA of the first `period` values; entries before that are NaN.
export function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = mean(values.slice(0, period));
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function last(series: number[]): number | null {
  const v = series[series.length - 1];
  return v === undefined || Number.isNaN(v) ? null : v;
}

// Wilder's RSI.
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const line = closes
    .map((_, i) => fastEma[i] - slowEma[i])
    .filter((v) => !Number.isNaN(v));
  const signal = last(emaSeries(line, signalPeriod));
  const value = last(line);
  if (value === null || signal === null) return null;
  return { value, signal, hist: value - signal };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const mid = mean(window);
  const sd = Math.sqrt(mean(window.map((v) => (v - mid) ** 2)));
  return { upper: mid + mult * sd, mid, lower: mid - mult * sd };
}

export function stochastic(candles: Candle[], period = 14, smooth = 3) {
  if (candles.length < period + smooth - 1) return null;
  const ks: number[] = [];
  for (let end = candles.length - smooth + 1; end <= candles.length; end++) {
    const window = candles.slice(end - period, end);
    const hh = Math.max(...window.map((c) => c.high));
    const ll = Math.min(...window.map((c) => c.low));
    const close = window[window.length - 1].close;
    ks.push(hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100);
  }
  return { k: ks[ks.length - 1], d: mean(ks) };
}

// Wilder's ATR.
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  let value = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return value;
}

export function analyze(candles: Candle[], fmt: (n: number) => string): Analysis | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const rows: IndicatorRow[] = [];

  const r = rsi(closes);
  if (r !== null) {
    rows.push({
      name: "RSI (14)",
      value: r.toFixed(1),
      signal: r < 30 ? 1 : r > 70 ? -1 : 0,
      note: r < 30 ? "Oversold" : r > 70 ? "Overbought" : "Zona netral",
    });
  }

  const st = stochastic(candles);
  if (st) {
    rows.push({
      name: "Stochastic (14,3)",
      value: `${st.k.toFixed(1)} / ${st.d.toFixed(1)}`,
      signal: st.k < 20 ? 1 : st.k > 80 ? -1 : 0,
      note: st.k < 20 ? "Oversold" : st.k > 80 ? "Overbought" : "Zona netral",
    });
  }

  const m = macd(closes);
  if (m) {
    rows.push({
      name: "MACD (12,26,9)",
      value: fmt(Math.abs(m.hist)).replace(/^/, m.hist < 0 ? "-" : "+"),
      signal: m.hist > 0 ? 1 : m.hist < 0 ? -1 : 0,
      note: m.hist > 0 ? "Momentum naik" : "Momentum turun",
    });
  }

  const emas: Record<number, number | null> = {};
  for (const period of [20, 50, 200]) {
    const e = last(emaSeries(closes, period));
    emas[period] = e;
    if (e === null) continue;
    rows.push({
      name: `EMA ${period}`,
      value: fmt(e),
      signal: price > e ? 1 : price < e ? -1 : 0,
      note: price > e ? "Harga di atas EMA" : "Harga di bawah EMA",
    });
  }

  const e50 = emas[50];
  const e200 = emas[200];
  if (e50 != null && e200 != null) {
    rows.push({
      name: "Tren EMA 50/200",
      value: e50 > e200 ? "Golden" : "Death",
      signal: e50 > e200 ? 1 : -1,
      note: e50 > e200 ? "Tren besar naik" : "Tren besar turun",
    });
  }

  const bb = bollinger(closes);
  if (bb) {
    rows.push({
      name: "Bollinger (20,2)",
      value: `${fmt(bb.lower)} – ${fmt(bb.upper)}`,
      signal: price < bb.lower ? 1 : price > bb.upper ? -1 : 0,
      note:
        price < bb.lower
          ? "Di bawah band bawah"
          : price > bb.upper
            ? "Di atas band atas"
            : "Di dalam band",
    });
  }

  const buy = rows.filter((x) => x.signal === 1).length;
  const sell = rows.filter((x) => x.signal === -1).length;

  // Classic pivot points from the last completed candle.
  const prev = candles[candles.length - 2];
  const p = (prev.high + prev.low + prev.close) / 3;
  const pivots = {
    p,
    r1: 2 * p - prev.low,
    s1: 2 * p - prev.high,
    r2: p + (prev.high - prev.low),
    s2: p - (prev.high - prev.low),
  };

  return {
    price,
    changePct: ((price - prevClose) / prevClose) * 100,
    rows,
    score: rows.length ? (buy - sell) / rows.length : 0,
    buy,
    sell,
    neutral: rows.length - buy - sell,
    atr: atr(candles),
    pivots,
  };
}

export function summaryLabel(score: number): { text: string; tone: Signal } {
  if (score >= 0.5) return { text: "BELI KUAT", tone: 1 };
  if (score >= 0.15) return { text: "BELI", tone: 1 };
  if (score <= -0.5) return { text: "JUAL KUAT", tone: -1 };
  if (score <= -0.15) return { text: "JUAL", tone: -1 };
  return { text: "NETRAL", tone: 0 };
}
