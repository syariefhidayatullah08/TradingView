import { rsi, type Candle, type Signal } from "./indicators";
import { outlook } from "./outlook";

export type SentimentPart = { label: string; value: number; note: string };

export type Sentiment = {
  // 0 (sangat bearish) .. 100 (sangat bullish)
  score: number;
  label: string;
  tone: Signal;
  parts: SentimentPart[];
};

const RANGE_LOOKBACK = 20;
const PRESSURE_LOOKBACK = 24;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function sentimentLabel(score: number): { label: string; tone: Signal } {
  if (score < 25) return { label: "Sangat Bearish", tone: -1 };
  if (score < 45) return { label: "Bearish", tone: -1 };
  if (score <= 55) return { label: "Netral", tone: 0 };
  if (score <= 75) return { label: "Bullish", tone: 1 };
  return { label: "Sangat Bullish", tone: 1 };
}

// Per-coin sentiment for the candles of one timeframe: the average of four
// 0..100 readings (momentum, trend, buy pressure, position in recent range).
export function sentiment(candles: Candle[]): Sentiment | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const parts: SentimentPart[] = [];

  const r = rsi(closes);
  if (r !== null) {
    parts.push({
      label: "Momentum (RSI)",
      value: r,
      note: r >= 70 ? "Pembeli sangat dominan" : r <= 30 ? "Penjual sangat dominan" : `RSI ${r.toFixed(0)}`,
    });
  }

  const o = outlook(candles, 1);
  if (o) {
    const net = (o.bullish - o.bearish) / o.factors.length;
    parts.push({
      label: "Tren",
      value: 50 + 50 * net,
      note: `${o.bullish} faktor naik, ${o.bearish} faktor turun`,
    });
  }

  const recent = candles.slice(-PRESSURE_LOOKBACK);
  const volume = recent.reduce((a, c) => a + c.volume, 0);
  if (volume > 0 && recent.every((c) => c.takerBuyVolume !== undefined)) {
    const ratio = recent.reduce((a, c) => a + (c.takerBuyVolume ?? 0), 0) / volume;
    parts.push({
      label: "Tekanan beli",
      // 40% buyers reads as fully bearish, 60% as fully bullish.
      value: clamp(((ratio - 0.4) / 0.2) * 100),
      note: `${(ratio * 100).toFixed(1)}% volume dari pembeli agresif`,
    });
  }

  const window = candles.slice(-RANGE_LOOKBACK);
  const high = Math.max(...window.map((c) => c.high));
  const low = Math.min(...window.map((c) => c.low));
  if (high > low) {
    const position = ((price - low) / (high - low)) * 100;
    parts.push({
      label: "Posisi harga",
      value: clamp(position),
      note: `${position.toFixed(0)}% dari rentang ${RANGE_LOOKBACK} candle terakhir`,
    });
  }

  if (parts.length === 0) return null;
  const score = Math.round(parts.reduce((a, p) => a + p.value, 0) / parts.length);
  return { score, ...sentimentLabel(score), parts };
}
