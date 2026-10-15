"use client";

import { useEffect, useState } from "react";
import { decide, type Decision } from "./decision";
import { getLive, subscribeLive } from "./live-candles";
import { applySantai } from "./santai";
import { getSantai } from "./use-santai";
import { COINS, higherTimeframe, type Coin, type Timeframe } from "./symbols";

export type ScanRow = { coin: Coin; interval: string; decision: Decision | null; live: boolean; error: boolean };

// Ticks arrive many times a second across all coins; recompute on a timer instead.
const RECOMPUTE_MS = 3000;

const noop = () => {};

function scanOnce(timeframe: Timeframe): ScanRow[] {
  const higher = higherTimeframe(timeframe);
  return COINS.map((coin) => {
    const live = getLive(coin.symbol, timeframe.binance);
    const big = higher ? getLive(coin.symbol, higher.binance).candles : null;
    const raw = live.candles && live.candles.length > 60 ? decide(live.candles, big, higher?.label ?? null) : null;
    const decision = raw && applySantai(raw, coin.symbol, getSantai());
    return { coin, interval: timeframe.binance, decision, live: live.live, error: live.error };
  });
}

// "Mulai Trading" decision for every coin on `timeframe`, kept live while `enabled`.
export function useScan(timeframe: Timeframe, enabled: boolean): ScanRow[] | null {
  const [rows, setRows] = useState<ScanRow[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const higher = higherTimeframe(timeframe);
    const unsubscribe = COINS.flatMap((coin) => [
      subscribeLive(coin.symbol, timeframe.binance, noop),
      ...(higher ? [subscribeLive(coin.symbol, higher.binance, noop)] : []),
    ]);
    const update = () => setRows(scanOnce(timeframe));
    const first = setTimeout(update, 0);
    const timer = setInterval(update, RECOMPUTE_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      unsubscribe.forEach((u) => u());
    };
  }, [timeframe, enabled]);

  return enabled ? rows : null;
}
