import { marketOutlook } from "./advice";
import { decide, type Decision } from "./decision";
import type { Candle } from "./indicators";
import { FEE_PCT, netPct, netTargetPrice } from "./positions";

// Replays the "Mulai Trading" decision candle by candle over history and simulates one
// position at a time, with Tokocrypto fees on both sides. Uses only data available at each
// candle's close, so the result shows what following the app's advice would have returned.

// Candles of history each decision sees; enough for EMA 200.
export const BACKTEST_WINDOW = 300;
// Trailing distance below the peak, in ATRs measured at entry.
const TRAIL_ATR = 1;

export type BacktestOptions = {
  sensitive: boolean;
  btcFilter: boolean;
  // "santai": no stop loss, sell at a fixed net profit. "normal": stop loss and target 1 from the plan.
  exit: "santai" | "normal";
  targetPct: number;
  // After the target is reached, keep riding while price climbs; sell when it falls one ATR from the peak.
  trailing: boolean;
  minConfidence: number;
  structure?: "votes" | "reversal";
};

export type BacktestInput = {
  candles: Candle[];
  intervalMs: number;
  higher: Candle[] | null;
  higherMs: number;
  higherLabel: string | null;
  // BTC daily candles for the market filter.
  btcDaily: Candle[] | null;
};

export type ExitReason = "target" | "stop" | "trail" | "open";

export type BacktestTrade = {
  entryTime: number;
  entryPrice: number;
  confidence: number;
  exitTime: number;
  exitPrice: number;
  netPct: number;
  reason: ExitReason;
};

export type BacktestResult = {
  trades: BacktestTrade[];
  wins: number;
  losses: number;
  // Compounded net return of all closed trades plus the open one at the last price.
  totalPct: number;
  avgHoldHours: number | null;
  // Largest fall in account value from a previous high, counting open-position swings.
  maxDrawdownPct: number;
  buyHoldPct: number;
  from: number;
  to: number;
};

const DAY_MS = 86_400_000;

// Index of the last candle in `list` that has closed by `time` (candle closes at start + ms).
function closedUpTo(list: Candle[], ms: number, time: number, from: number): number {
  let i = from;
  while (i + 1 < list.length && list[i + 1].time + ms <= time) i++;
  return i;
}

export async function runBacktest(
  input: BacktestInput,
  opts: BacktestOptions,
  onProgress?: (done: number) => void,
): Promise<BacktestResult> {
  const { candles, intervalMs } = input;
  const trades: BacktestTrade[] = [];
  let hi = -1;
  let mi = -1;
  let pos: {
    entryTime: number;
    entryPrice: number;
    confidence: number;
    stop: number | null;
    target: number;
    trail: number;
    peak: number | null;
  } | null = null;
  let equity = 1;
  let peakEquity = 1;
  let maxDrawdown = 0;

  const close = (time: number, price: number, reason: ExitReason) => {
    const pct = netPct(pos!.entryPrice, price);
    trades.push({
      entryTime: pos!.entryTime,
      entryPrice: pos!.entryPrice,
      confidence: pos!.confidence,
      exitTime: time,
      exitPrice: price,
      netPct: pct,
      reason,
    });
    equity *= 1 + pct / 100;
    pos = null;
  };

  for (let i = BACKTEST_WINDOW; i < candles.length; i++) {
    const c = candles[i];
    const closeTime = c.time + intervalMs;

    if (pos) {
      if (pos.stop !== null && c.low <= pos.stop && pos.peak === null) {
        close(closeTime, pos.stop, "stop");
      } else if (pos.peak === null && c.high >= pos.target) {
        if (opts.trailing) pos.peak = c.high;
        else close(closeTime, pos.target, "target");
      }
      if (pos && pos.peak !== null) {
        pos.peak = Math.max(pos.peak, c.high);
        // Never trail below the target, so a reached target is never given back.
        const floor = Math.max(pos.target, pos.peak - pos.trail);
        if (c.close <= floor) close(closeTime, floor, "trail");
      }
      if (pos) {
        const value = equity * (1 + netPct(pos.entryPrice, c.close) / 100);
        peakEquity = Math.max(peakEquity, value);
        maxDrawdown = Math.max(maxDrawdown, (1 - value / peakEquity) * 100);
      }
    }

    if (!pos) {
      let higher: Candle[] | null = null;
      if (input.higher) {
        hi = closedUpTo(input.higher, input.higherMs, closeTime, hi);
        higher = hi >= 0 ? input.higher.slice(Math.max(0, hi - BACKTEST_WINDOW + 1), hi + 1) : null;
      }
      let market = null;
      if (opts.btcFilter && input.btcDaily) {
        mi = closedUpTo(input.btcDaily, DAY_MS, closeTime, mi);
        if (mi >= 0) market = marketOutlook(input.btcDaily.slice(0, mi + 1));
      }
      const d: Decision | null = decide(
        candles.slice(i - BACKTEST_WINDOW + 1, i + 1),
        higher,
        input.higherLabel,
        { sensitive: opts.sensitive, market, structure: opts.structure },
      );
      if (d && d.action === "beli" && d.confidence >= opts.minConfidence && d.plan) {
        pos = {
          entryTime: closeTime,
          entryPrice: d.price,
          confidence: d.confidence,
          stop: opts.exit === "normal" ? d.plan.stop : null,
          target: opts.exit === "normal" ? d.plan.target1 : netTargetPrice(d.price, opts.targetPct),
          trail: d.plan.atr * TRAIL_ATR,
          peak: null,
        };
      }
      peakEquity = Math.max(peakEquity, equity);
    }

    if (i % 40 === 0) {
      onProgress?.((i - BACKTEST_WINDOW) / (candles.length - BACKTEST_WINDOW));
      // Yield so the page stays responsive during a long run.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const last = candles[candles.length - 1];
  let open: BacktestTrade | null = null;
  let total = equity;
  if (pos) {
    const pct = netPct(pos.entryPrice, last.close);
    open = {
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      confidence: pos.confidence,
      exitTime: last.time + intervalMs,
      exitPrice: last.close,
      netPct: pct,
      reason: "open",
    };
    total *= 1 + pct / 100;
  }

  const closed = trades;
  const wins = closed.filter((t) => t.netPct > 0).length;
  const holds = closed.map((t) => (t.exitTime - t.entryTime) / 3_600_000);
  const first = candles[BACKTEST_WINDOW];
  return {
    trades: open ? [...closed, open] : closed,
    wins,
    losses: closed.length - wins,
    totalPct: (total - 1) * 100,
    avgHoldHours: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null,
    maxDrawdownPct: maxDrawdown,
    buyHoldPct: netPct(first.close, last.close),
    from: first.time,
    to: last.time + intervalMs,
  };
}

export const FEES_NOTE = `Biaya ${FEE_PCT}% beli + ${FEE_PCT}% jual sudah dihitung.`;
