import { atr, type Candle } from "./indicators";
import { detectSignals } from "./signals";

export type Position = {
  id: string;
  symbol: string;
  // Binance interval the plan was built on, e.g. "1h".
  interval: string;
  entryPrice: number;
  entryTime: number;
  amount: number | null;
  stop: number;
  target1: number;
  target2: number;
};

export type PlanLevels = { stop: number; target1: number; target2: number; atr: number; support: number; resistance: number };

export type Verdict = "tahan" | "amankan" | "jual";

export type PositionStatus = {
  price: number;
  pnlPct: number;
  pnlValue: number | null;
  verdict: Verdict;
  headline: string;
  reasons: string[];
  // 0..1 progress from entry towards target1 (negative towards stop).
  progress: number;
};

const STOP_ATR = 1.5;
const TARGET_ATR = 2;
const TARGET2_ATR = 3;
const SWING_LOOKBACK = 20;

// Exit levels for a buy at `entry`, from the volatility and swing levels of the candles.
export function planLevels(candles: Candle[], entry: number): PlanLevels | null {
  const a = atr(candles);
  if (a === null || candles.length < SWING_LOOKBACK + 1) return null;
  const swing = candles.slice(-SWING_LOOKBACK - 1, -1);
  const support = Math.min(...swing.map((c) => c.low));
  const resistance = Math.max(...swing.map((c) => c.high));
  const stop = entry - STOP_ATR * a;
  const risk = entry - stop;
  // Take the nearest resistance as the first target when it pays at least 1:1, else a volatility target.
  const target1 = resistance > entry + risk ? resistance : entry + TARGET_ATR * a;
  const target2 = Math.max(target1 + a, entry + TARGET2_ATR * a);
  return { stop, target1, target2, atr: a, support, resistance };
}

export function evaluate(position: Position, candles: Candle[]): PositionStatus {
  const price = candles[candles.length - 1].close;
  const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;
  const pnlValue = position.amount === null ? null : (price - position.entryPrice) * position.amount;
  const risk = position.entryPrice - position.stop;
  const reasons: string[] = [];
  let verdict: Verdict = "tahan";
  let headline = "Tahan, belum ada alasan untuk jual";

  const signals = detectSignals(candles);
  const last = signals[signals.length - 1];
  const sellSignalAfterEntry = last && last.type === "jual" && last.time > position.entryTime;

  if (price <= position.stop) {
    verdict = "jual";
    headline = "JUAL SEKARANG: batas rugi (stop loss) tersentuh";
    reasons.push(`Harga ${fmt(price)} di bawah stop loss ${fmt(position.stop)}. Batasi kerugian sebelum membesar.`);
  } else if (price >= position.target2) {
    verdict = "jual";
    headline = "JUAL: target 2 tercapai";
    reasons.push(`Harga sudah melewati target 2 (${fmt(position.target2)}). Ambil untung seluruhnya.`);
  } else if (price >= position.target1) {
    verdict = sellSignalAfterEntry ? "jual" : "amankan";
    headline = sellSignalAfterEntry
      ? "JUAL: target 1 tercapai dan sinyal jual muncul"
      : "Target 1 tercapai: jual sebagian, sisanya tahan dengan stop di harga beli";
    reasons.push(`Harga ${fmt(price)} di atas target 1 (${fmt(position.target1)}).`);
    if (sellSignalAfterEntry) reasons.push(`Sinyal jual: ${last.reason}.`);
    else reasons.push(`Target berikutnya ${fmt(position.target2)}; naikkan stop loss ke ${fmt(position.entryPrice)} agar tidak rugi.`);
  } else if (sellSignalAfterEntry) {
    verdict = pnlPct >= 0 ? "jual" : "amankan";
    headline = pnlPct >= 0 ? "JUAL: sinyal jual muncul setelah pembelian" : "Sinyal jual muncul saat posisi rugi: siapkan keluar";
    reasons.push(`Sinyal jual: ${last.reason}.`);
    if (pnlPct < 0) reasons.push(`Rugi ${pnlPct.toFixed(2)}%. Jual jika harga tidak segera pulih di atas ${fmt(position.entryPrice)}.`);
  } else if (price - position.entryPrice >= risk) {
    verdict = "amankan";
    headline = "Untung sudah 1× risiko: naikkan stop loss ke harga beli";
    reasons.push(`Harga ${fmt(price)} naik ${pnlPct.toFixed(2)}%. Geser stop ke ${fmt(position.entryPrice)} supaya posisi ini tidak bisa rugi.`);
  } else {
    reasons.push(`Harga ${fmt(price)} masih antara stop loss ${fmt(position.stop)} dan target 1 ${fmt(position.target1)}.`);
  }

  const progress =
    price >= position.entryPrice
      ? Math.min(1, (price - position.entryPrice) / (position.target1 - position.entryPrice))
      : -Math.min(1, (position.entryPrice - price) / risk);

  return { price, pnlPct, pnlValue, verdict, headline, reasons, progress };
}

function fmt(n: number): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export type ClosedTrade = {
  id: string;
  symbol: string;
  interval: string;
  entryPrice: number;
  entryTime: number;
  amount: number | null;
  exitPrice: number;
  exitTime: number;
};

export type TradeResult = { pnlPct: number; pnlValue: number | null };

export function tradeResult(t: ClosedTrade): TradeResult {
  return {
    pnlPct: ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100,
    pnlValue: t.amount === null ? null : (t.exitPrice - t.entryPrice) * t.amount,
  };
}

export type Report = {
  count: number;
  wins: number;
  losses: number;
  avgPct: number | null;
  // USDT totals over trades that recorded an amount.
  profit: number;
  loss: number;
  net: number;
  valued: number;
};

export function buildReport(trades: ClosedTrade[]): Report {
  let wins = 0;
  let losses = 0;
  let profit = 0;
  let loss = 0;
  let valued = 0;
  let pctSum = 0;
  for (const t of trades) {
    const r = tradeResult(t);
    pctSum += r.pnlPct;
    if (r.pnlPct > 0) wins++;
    else if (r.pnlPct < 0) losses++;
    if (r.pnlValue !== null) {
      valued++;
      if (r.pnlValue >= 0) profit += r.pnlValue;
      else loss += -r.pnlValue;
    }
  }
  return {
    count: trades.length,
    wins,
    losses,
    avgPct: trades.length ? pctSum / trades.length : null,
    profit,
    loss,
    net: profit - loss,
    valued,
  };
}
