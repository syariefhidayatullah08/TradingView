import { atr, emaSeries, macd, rsi, type Candle, type Signal } from "./indicators";

export type Factor = { label: string; tone: Signal };

export type Outlook = {
  direction: "NAIK" | "TURUN" | "SIDEWAYS";
  tone: Signal;
  // 0..100: how strongly the trend factors agree on the direction.
  strength: number;
  bullish: number;
  bearish: number;
  factors: Factor[];
  price: number;
  rangeLow: number | null;
  rangeHigh: number | null;
  support: number;
  resistance: number;
  warning: string | null;
};

const DIRECTION_THRESHOLD = 0.3;
const SLOPE_LOOKBACK = 5;
const MOMENTUM_LOOKBACK = 10;
const SWING_LOOKBACK = 20;

// Trend-following read of where price is most likely heading over the next
// `horizon` candles. A heuristic vote of trend factors, not a statistical forecast.
export function outlook(candles: Candle[], horizon: number): Outlook | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const factors: Factor[] = [];

  for (const period of [20, 50, 200]) {
    const series = emaSeries(closes, period);
    const e = series[series.length - 1];
    if (Number.isNaN(e)) continue;
    factors.push({
      label: price >= e ? `Harga di atas EMA ${period}` : `Harga di bawah EMA ${period}`,
      tone: price >= e ? 1 : -1,
    });
    if (period === 20) {
      const before = series[series.length - 1 - SLOPE_LOOKBACK];
      if (!Number.isNaN(before)) {
        factors.push({
          label: e >= before ? "EMA 20 menanjak" : "EMA 20 menurun",
          tone: e >= before ? 1 : -1,
        });
      }
    }
  }

  const m = macd(closes);
  if (m) {
    factors.push({
      label: m.hist >= 0 ? "MACD di atas garis sinyal" : "MACD di bawah garis sinyal",
      tone: m.hist >= 0 ? 1 : -1,
    });
  }

  const r = rsi(closes);
  if (r !== null) {
    factors.push({
      label: `RSI ${r.toFixed(0)} — ${r > 55 ? "momentum beli" : r < 45 ? "momentum jual" : "momentum netral"}`,
      tone: r > 55 ? 1 : r < 45 ? -1 : 0,
    });
  }

  const past = closes[closes.length - 1 - MOMENTUM_LOOKBACK];
  const roc = ((price - past) / past) * 100;
  factors.push({
    label: `${roc >= 0 ? "Naik" : "Turun"} ${Math.abs(roc).toFixed(1)}% dalam ${MOMENTUM_LOOKBACK} candle`,
    tone: roc > 0 ? 1 : roc < 0 ? -1 : 0,
  });

  const bullish = factors.filter((f) => f.tone === 1).length;
  const bearish = factors.filter((f) => f.tone === -1).length;
  const score = (bullish - bearish) / factors.length;
  const tone: Signal = score >= DIRECTION_THRESHOLD ? 1 : score <= -DIRECTION_THRESHOLD ? -1 : 0;

  // Swing levels from the candles before the current one.
  const swing = candles.slice(-SWING_LOOKBACK - 1, -1);
  const a = atr(candles);
  // Volatility scales roughly with the square root of time.
  const reach = a === null ? null : a * Math.sqrt(horizon);

  let warning: string | null = null;
  if (r !== null && r >= 75) warning = "RSI overbought — rawan koreksi turun";
  else if (r !== null && r <= 25) warning = "RSI oversold — rawan pantulan naik";

  return {
    direction: tone === 1 ? "NAIK" : tone === -1 ? "TURUN" : "SIDEWAYS",
    tone,
    strength: Math.round(Math.abs(score) * 100),
    bullish,
    bearish,
    factors,
    price,
    rangeLow: reach === null ? null : price - reach,
    rangeHigh: reach === null ? null : price + reach,
    support: Math.min(...swing.map((c) => c.low)),
    resistance: Math.max(...swing.map((c) => c.high)),
    warning,
  };
}
