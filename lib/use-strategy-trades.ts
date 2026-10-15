"use client";

import { useEffect, useRef, useState } from "react";
import { MARKET_INTERVAL, MARKET_SYMBOL } from "./advice";
import { runBacktest, type BacktestResult } from "./backtest";
import { backtestOptions } from "./evidence";
import type { Candle } from "./indicators";
import { useLiveCandles } from "./live-candles";
import { higherTimeframe, type Timeframe } from "./symbols";
import { useSantai } from "./use-santai";

const INTERVAL_MS: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

// Trades the app's real strategy (same as Mulai Trading and Uji Strategi, with the user's
// settings) would have made over the candles on a chart. Recomputed when a candle closes.
export function useStrategyTrades(symbol: string, timeframe: Timeframe, candles: Candle[] | null): BacktestResult | null {
  const higherTf = higherTimeframe(timeframe);
  const higher = useLiveCandles(symbol, (higherTf ?? timeframe).binance);
  const btc = useLiveCandles(MARKET_SYMBOL, MARKET_INTERVAL);
  const { settings } = useSantai();
  const [result, setResult] = useState<BacktestResult | null>(null);

  // Latest data for the async run, read when it starts.
  const data = useRef({ candles, higher: higher.candles, btc: btc.candles });
  // Runs before the effect below on every render, so a run always starts from fresh data.
  useEffect(() => {
    data.current = { candles, higher: higher.candles, btc: btc.candles };
  });

  const closed = candles && candles.length > 1 ? candles[candles.length - 2].time : 0;
  const ready = Boolean(candles && (!higherTf || higher.candles) && btc.candles);
  const optsKey = JSON.stringify(backtestOptions(settings));

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const { candles: c, higher: h, btc: b } = data.current;
    if (!c) return;
    runBacktest(
      {
        candles: c,
        intervalMs: INTERVAL_MS[timeframe.binance],
        higher: higherTf ? h : null,
        higherMs: higherTf ? INTERVAL_MS[higherTf.binance] : 0,
        higherLabel: higherTf?.label ?? null,
        btcDaily: b,
      },
      JSON.parse(optsKey),
    )
      .then((r) => !cancelled && setResult(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-run only when a candle closes or the strategy changes, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, closed, optsKey, symbol, timeframe.binance]);

  return result;
}
