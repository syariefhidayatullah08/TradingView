import type { Candle } from "./indicators";

// Price-structure tools used by experienced traders: swing points, support/resistance zones,
// break of structure, RSI divergence and VWAP. All are computed from candles alone.

export type Swing = { index: number; price: number; kind: "high" | "low" };

// A swing high/low is the extreme of `span` candles on each side.
export function swings(candles: Candle[], span = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = span; i < candles.length - span; i++) {
    let high = true;
    let low = true;
    for (let k = i - span; k <= i + span; k++) {
      if (k === i) continue;
      if (candles[k].high >= candles[i].high) high = false;
      if (candles[k].low <= candles[i].low) low = false;
    }
    if (high) out.push({ index: i, price: candles[i].high, kind: "high" });
    if (low) out.push({ index: i, price: candles[i].low, kind: "low" });
  }
  return out;
}

export type Zone = { price: number; touches: number; kind: "support" | "resistance" };

// Swing prices that cluster within `tolerance` of each other form a zone; more touches, stronger zone.
export function zones(candles: Candle[], tolerance = 0.006, max = 3): Zone[] {
  const price = candles[candles.length - 1].close;
  const points = swings(candles).map((s) => s.price);
  const clusters: { sum: number; n: number }[] = [];
  for (const p of points.sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.sum / last.n) / p <= tolerance) {
      last.sum += p;
      last.n++;
    } else clusters.push({ sum: p, n: 1 });
  }
  const all = clusters
    .filter((c) => c.n >= 2)
    .map((c) => ({ price: c.sum / c.n, touches: c.n }));
  const below = all
    .filter((z) => z.price < price)
    .sort((a, b) => b.price - a.price)
    .slice(0, max)
    .map((z) => ({ ...z, kind: "support" as const }));
  const above = all
    .filter((z) => z.price > price)
    .sort((a, b) => a.price - b.price)
    .slice(0, max)
    .map((z) => ({ ...z, kind: "resistance" as const }));
  return [...below, ...above];
}

// Bullish break of structure: after a lower low, the latest close breaks above the most recent
// swing high, a sign the down-move has turned. Looks at the last `lookback` candles.
export function bullishBreak(candles: Candle[], lookback = 60): boolean {
  const recent = candles.slice(-lookback);
  const sw = swings(recent);
  const highs = sw.filter((s) => s.kind === "high");
  const lows = sw.filter((s) => s.kind === "low");
  if (highs.length < 1 || lows.length < 2) return false;
  const lastHigh = highs[highs.length - 1];
  const [prevLow, lastLow] = lows.slice(-2);
  const close = recent[recent.length - 1].close;
  const prevClose = recent[recent.length - 2].close;
  // The break must be fresh: this candle closes above the swing high, the previous one did not.
  return lastLow.price < prevLow.price && lastLow.index > lastHigh.index - 10 && close > lastHigh.price && prevClose <= lastHigh.price;
}

function rsiSeries(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// Bullish RSI divergence: the two latest swing lows make a lower low in price but a higher low
// in RSI, with the second low recent and RSI below 45 (selling is tiring out).
export function bullishDivergence(candles: Candle[], lookback = 60, recentWithin = 6): boolean {
  const start = Math.max(0, candles.length - lookback);
  const rsi = rsiSeries(candles.map((c) => c.close));
  const lows = swings(candles.slice(start), 2)
    .filter((s) => s.kind === "low")
    .map((s) => ({ ...s, index: s.index + start }));
  if (lows.length < 2) return false;
  const [a, b] = lows.slice(-2);
  if (candles.length - 1 - b.index > recentWithin) return false;
  return b.price < a.price && rsi[b.index] > rsi[a.index] && rsi[b.index] < 45;
}

// Volume-weighted average price over the last `period` candles.
export function vwap(candles: Candle[], period = 24): number | null {
  const recent = candles.slice(-period);
  let pv = 0;
  let v = 0;
  for (const c of recent) {
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : null;
}
