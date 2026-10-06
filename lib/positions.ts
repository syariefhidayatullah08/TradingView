import { atr, type Candle } from "./indicators";
import { outlook } from "./outlook";
import { detectSignals } from "./signals";

// "untung": never advise selling below the entry price (no stop loss); sell only once the
// position is in profit and the market turns. "stoploss": classic plan with a stop loss.
export type ExitMode = "untung" | "stoploss";

export type Position = {
  id: string;
  symbol: string;
  mode: ExitMode;
  // Binance interval the plan was built on, e.g. "1h".
  interval: string;
  entryPrice: number;
  entryTime: number;
  amount: number | null;
  stop: number;
  target1: number;
  target2: number;
};

export type PlanLevels = {
  stop: number;
  target1: number;
  target2: number;
  atr: number;
  support: number;
  resistance: number;
};

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
// Net profit needed before a sale counts as a win, covering Tokocrypto fees on both sides.
const MIN_PROFIT_PCT = 0.5;

// Exit levels for a buy at `entry`, from the volatility and swing levels of the candles.
export function planLevels(
  candles: Candle[],
  entry: number,
): PlanLevels | null {
  const a = atr(candles);
  if (a === null || candles.length < SWING_LOOKBACK + 1) return null;
  const swing = candles.slice(-SWING_LOOKBACK - 1, -1);
  const support = Math.min(...swing.map((c) => c.low));
  const resistance = Math.max(...swing.map((c) => c.high));
  const stop = entry - STOP_ATR * a;
  const risk = entry - stop;
  // Take the nearest resistance as the first target when it pays at least 1:1, else a volatility target.
  const target1 =
    resistance > entry + risk ? resistance : entry + TARGET_ATR * a;
  const target2 = Math.max(target1 + a, entry + TARGET2_ATR * a);
  return { stop, target1, target2, atr: a, support, resistance };
}

export function evaluate(
  position: Position,
  candles: Candle[],
): PositionStatus {
  const price = candles[candles.length - 1].close;
  const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;
  const pnlValue =
    position.amount === null
      ? null
      : (price - position.entryPrice) * position.amount;
  const risk = position.entryPrice - position.stop;
  const reasons: string[] = [];
  let verdict: Verdict = "tahan";
  let headline = "Tahan, belum ada alasan untuk jual";

  const signals = detectSignals(candles);
  const last = signals[signals.length - 1];
  const sellSignalAfterEntry =
    last && last.type === "jual" && last.time > position.entryTime;

  if (position.mode === "untung") {
    return profitOnly(
      position,
      candles,
      price,
      pnlPct,
      pnlValue,
      sellSignalAfterEntry ? last.reason : null,
    );
  }

  if (price <= position.stop) {
    verdict = "jual";
    headline = "JUAL SEKARANG: batas rugi (stop loss) tersentuh";
    reasons.push(
      `Harga ${fmt(price)} di bawah stop loss ${fmt(position.stop)}. Batasi kerugian sebelum membesar.`,
    );
  } else if (price >= position.target2) {
    verdict = "jual";
    headline = "JUAL: target 2 tercapai";
    reasons.push(
      `Harga sudah melewati target 2 (${fmt(position.target2)}). Ambil untung seluruhnya.`,
    );
  } else if (price >= position.target1) {
    verdict = sellSignalAfterEntry ? "jual" : "amankan";
    headline = sellSignalAfterEntry
      ? "JUAL: target 1 tercapai dan sinyal jual muncul"
      : "Target 1 tercapai: jual sebagian, sisanya tahan dengan stop di harga beli";
    reasons.push(
      `Harga ${fmt(price)} di atas target 1 (${fmt(position.target1)}).`,
    );
    if (sellSignalAfterEntry) reasons.push(`Sinyal jual: ${last.reason}.`);
    else
      reasons.push(
        `Target berikutnya ${fmt(position.target2)}; naikkan stop loss ke ${fmt(position.entryPrice)} agar tidak rugi.`,
      );
  } else if (sellSignalAfterEntry) {
    verdict = pnlPct >= 0 ? "jual" : "amankan";
    headline =
      pnlPct >= 0
        ? "JUAL: sinyal jual muncul setelah pembelian"
        : "Sinyal jual muncul saat posisi rugi: siapkan keluar";
    reasons.push(`Sinyal jual: ${last.reason}.`);
    if (pnlPct < 0)
      reasons.push(
        `Rugi ${pnlPct.toFixed(2)}%. Jual jika harga tidak segera pulih di atas ${fmt(position.entryPrice)}.`,
      );
  } else if (price - position.entryPrice >= risk) {
    verdict = "amankan";
    headline = "Untung sudah 1× risiko: naikkan stop loss ke harga beli";
    reasons.push(
      `Harga ${fmt(price)} naik ${pnlPct.toFixed(2)}%. Geser stop ke ${fmt(position.entryPrice)} supaya posisi ini tidak bisa rugi.`,
    );
  } else {
    reasons.push(
      `Harga ${fmt(price)} masih antara stop loss ${fmt(position.stop)} dan target 1 ${fmt(position.target1)}.`,
    );
  }

  const progress =
    price >= position.entryPrice
      ? Math.min(
          1,
          (price - position.entryPrice) /
            (position.target1 - position.entryPrice),
        )
      : -Math.min(1, (position.entryPrice - price) / risk);

  return { price, pnlPct, pnlValue, verdict, headline, reasons, progress };
}

// Profit-only mode: hold through losses, sell only in profit when the market stops supporting the trade.
function profitOnly(
  position: Position,
  candles: Candle[],
  price: number,
  pnlPct: number,
  pnlValue: number | null,
  sellSignal: string | null,
): PositionStatus {
  const o = outlook(candles, 1);
  const trendDown = o !== null && o.tone === -1 && o.strength >= 45;
  const reasons: string[] = [];
  let verdict: Verdict = "tahan";
  let headline: string;
  const progress = Math.max(
    -1,
    Math.min(
      1,
      (price - position.entryPrice) / (position.target1 - position.entryPrice),
    ),
  );

  if (pnlPct < MIN_PROFIT_PCT) {
    headline =
      pnlPct < 0
        ? `BELUM UNTUNG: tahan, jangan jual di bawah harga beli ${fmt(position.entryPrice)}`
        : `Untung masih tipis (${pnlPct.toFixed(2)}%): tahan sampai di atas ${MIN_PROFIT_PCT}% agar menutup biaya`;
    reasons.push(
      pnlPct < 0
        ? `Harga ${fmt(price)} masih ${Math.abs(pnlPct).toFixed(2)}% di bawah harga beli. Mode ini menunggu sampai untung.`
        : `Harga ${fmt(price)}, baru ${pnlPct.toFixed(2)}% di atas harga beli.`,
    );
    if (o)
      reasons.push(
        `Arah pasar sekarang ${o.direction} (kekuatan ${o.strength}%)${trendDown ? "; pemulihan bisa makan waktu lama" : ""}.`,
      );
    reasons.push(
      `Harga perlu mencapai ${fmt(position.entryPrice * (1 + MIN_PROFIT_PCT / 100))} dulu sebelum sinyal jual diberikan.`,
    );
    return { price, pnlPct, pnlValue, verdict, headline, reasons, progress };
  }

  // In profit from here on.
  if (price >= position.target2) {
    verdict = "jual";
    headline = `JUAL: untung ${pnlPct.toFixed(2)}%, target 2 tercapai`;
    reasons.push(
      `Harga ${fmt(price)} sudah melewati target 2 (${fmt(position.target2)}). Ambil untung seluruhnya.`,
    );
  } else if (sellSignal) {
    verdict = "jual";
    headline = `JUAL: untung ${pnlPct.toFixed(2)}% dan sinyal jual muncul`;
    reasons.push(`Sinyal jual: ${sellSignal}. Amankan untung sebelum hilang.`);
  } else if (trendDown) {
    verdict = "jual";
    headline = `JUAL: untung ${pnlPct.toFixed(2)}% dan arah pasar berbalik turun`;
    reasons.push(
      `Arah pasar TURUN dengan kekuatan ${o?.strength}%. Untung yang ada bisa habis kalau ditahan.`,
    );
  } else if (price >= position.target1) {
    verdict = "amankan";
    headline = `Target 1 tercapai (untung ${pnlPct.toFixed(2)}%): jual sebagian, sisanya tahan`;
    reasons.push(
      `Harga ${fmt(price)} di atas target 1 (${fmt(position.target1)}); target berikutnya ${fmt(position.target2)}.`,
    );
    if (o)
      reasons.push(
        `Arah pasar masih ${o.direction}, jadi sisa posisi boleh ditahan.`,
      );
  } else {
    headline = `UNTUNG ${pnlPct.toFixed(2)}%: tahan, pasar masih mendukung`;
    reasons.push(
      `Belum ada sinyal jual dan arah pasar ${o?.direction ?? "belum jelas"}. Target 1 di ${fmt(position.target1)}.`,
    );
    reasons.push(
      "Sinyal JUAL akan muncul saat target tercapai, sinyal jual terbentuk, atau arah pasar berbalik turun.",
    );
  }
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
    pnlValue:
      t.amount === null ? null : (t.exitPrice - t.entryPrice) * t.amount,
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

export type WeekSummary = {
  // Monday 00:00 local time of the week, in ms.
  weekStart: number;
  count: number;
  wins: number;
  losses: number;
  // USDT result and the capital it was earned on, over trades that recorded an amount.
  net: number;
  capital: number;
  // Net USDT / capital when amounts exist, otherwise the average % per trade.
  pct: number;
};

function mondayOf(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Results grouped by the week the trade was sold in, newest week first.
export function weeklyReport(trades: ClosedTrade[]): WeekSummary[] {
  const weeks = new Map<number, { trades: ClosedTrade[] }>();
  for (const t of trades) {
    const key = mondayOf(t.exitTime);
    const w = weeks.get(key) ?? { trades: [] };
    w.trades.push(t);
    weeks.set(key, w);
  }
  return [...weeks.entries()]
    .map(([weekStart, { trades: list }]) => {
      let net = 0;
      let capital = 0;
      let pctSum = 0;
      let wins = 0;
      let losses = 0;
      for (const t of list) {
        const r = tradeResult(t);
        pctSum += r.pnlPct;
        if (r.pnlPct > 0) wins++;
        else if (r.pnlPct < 0) losses++;
        if (r.pnlValue !== null && t.amount !== null) {
          net += r.pnlValue;
          capital += t.entryPrice * t.amount;
        }
      }
      return {
        weekStart,
        count: list.length,
        wins,
        losses,
        net,
        capital,
        pct: capital > 0 ? (net / capital) * 100 : pctSum / list.length,
      };
    })
    .sort((a, b) => b.weekStart - a.weekStart);
}
