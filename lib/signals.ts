import { emaSeries, type Candle } from "./indicators";

export type SignalType = "beli" | "jual";

export type TradeSignal = {
  index: number;
  time: number;
  type: SignalType;
  price: number;
  reason: string;
};

export type Trade = { buy: TradeSignal; sell: TradeSignal | null; returnPct: number };

export type SignalStats = {
  buys: number;
  sells: number;
  trades: Trade[];
  wins: number;
  losses: number;
  avgReturnPct: number | null;
  last: TradeSignal | null;
  // Change in price since the last signal fired.
  sinceLastPct: number | null;
};

export type VolumeSplit = { buy: number; sell: number; buyShare: number };

const TREND_PERIOD = 50;
const RSI_PERIOD = 14;

function rsiSeries(closes: number[], period = RSI_PERIOD): number[] {
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

function macdSeries(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const line = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const valid = line.filter((v) => !Number.isNaN(v));
  const signalValid = emaSeries(valid, signalPeriod);
  const offset = line.length - valid.length;
  const signal = line.map((_, i) => (i < offset ? NaN : signalValid[i - offset]));
  return { line, signal };
}

// Buy/sell events from two classic rules: MACD crossovers in the direction of the
// EMA 50 trend, and RSI leaving the oversold/overbought zones. Signals alternate,
// so a buy is only reported after a sell and vice versa.
export function detectSignals(candles: Candle[]): TradeSignal[] {
  const closes = candles.map((c) => c.close);
  const ema = emaSeries(closes, TREND_PERIOD);
  const rsi = rsiSeries(closes);
  const { line, signal } = macdSeries(closes);
  const signals: TradeSignal[] = [];
  let lastType: SignalType | null = null;

  for (let i = 1; i < candles.length; i++) {
    if ([ema[i], rsi[i], rsi[i - 1], line[i], line[i - 1], signal[i], signal[i - 1]].some(Number.isNaN)) {
      continue;
    }
    const price = closes[i];
    const macdUp = line[i - 1] <= signal[i - 1] && line[i] > signal[i];
    const macdDown = line[i - 1] >= signal[i - 1] && line[i] < signal[i];
    const rsiUp = rsi[i - 1] < 30 && rsi[i] >= 30;
    const rsiDown = rsi[i - 1] > 70 && rsi[i] <= 70;

    let type: SignalType | null = null;
    let reason = "";
    if (macdUp && price > ema[i]) {
      type = "beli";
      reason = "MACD memotong ke atas garis sinyal, harga di atas EMA 50";
    } else if (rsiUp) {
      type = "beli";
      reason = "RSI keluar dari zona oversold (naik melewati 30)";
    } else if (macdDown && price < ema[i]) {
      type = "jual";
      reason = "MACD memotong ke bawah garis sinyal, harga di bawah EMA 50";
    } else if (rsiDown) {
      type = "jual";
      reason = "RSI keluar dari zona overbought (turun melewati 70)";
    }

    if (type && type !== lastType) {
      signals.push({ index: i, time: candles[i].time, type, price, reason });
      lastType = type;
    }
  }
  return signals;
}

export function signalStats(signals: TradeSignal[], candles: Candle[]): SignalStats {
  const price = candles[candles.length - 1].close;
  const trades: Trade[] = [];
  for (let i = 0; i < signals.length; i++) {
    if (signals[i].type !== "beli") continue;
    const sell = signals[i + 1] ?? null;
    const exit = sell ? sell.price : price;
    trades.push({ buy: signals[i], sell, returnPct: ((exit - signals[i].price) / signals[i].price) * 100 });
  }
  const closed = trades.filter((t) => t.sell);
  const wins = closed.filter((t) => t.returnPct > 0).length;
  const last = signals[signals.length - 1] ?? null;
  return {
    buys: signals.filter((s) => s.type === "beli").length,
    sells: signals.filter((s) => s.type === "jual").length,
    trades,
    wins,
    losses: closed.length - wins,
    avgReturnPct: closed.length ? closed.reduce((a, t) => a + t.returnPct, 0) / closed.length : null,
    last,
    sinceLastPct: last ? ((price - last.price) / last.price) * 100 : null,
  };
}

// Market-buy versus market-sell volume over the last `lookback` candles.
export function volumeSplit(candles: Candle[], lookback: number): VolumeSplit | null {
  const recent = candles.slice(-lookback);
  if (!recent.every((c) => c.takerBuyVolume !== undefined)) return null;
  const buy = recent.reduce((a, c) => a + (c.takerBuyVolume ?? 0), 0);
  const total = recent.reduce((a, c) => a + c.volume, 0);
  if (total <= 0) return null;
  return { buy, sell: total - buy, buyShare: buy / total };
}
