"use client";

import { useCallback, useSyncExternalStore } from "react";
import { fetchCandles } from "./candles";
import type { Candle } from "./indicators";

// One shared Binance WebSocket for the whole app. Every panel that needs candles for a
// (symbol, interval) subscribes here; history is loaded once and each tick is merged in.

const STREAM_URL = "wss://data-stream.binance.vision/stream";
const HISTORY = 500;
const RETRY_MS = 3000;
// Keep a stream alive briefly after its last subscriber leaves (tab switches).
const LINGER_MS = 30_000;

export type LiveCandles = {
  candles: Candle[] | null;
  live: boolean;
  error: boolean;
};

type Entry = {
  symbol: string;
  interval: string;
  stream: string;
  snapshot: LiveCandles;
  listeners: Set<() => void>;
  loading: boolean;
  subscribed: boolean;
  linger?: ReturnType<typeof setTimeout>;
};

const EMPTY: LiveCandles = { candles: null, live: false, error: false };
const entries = new Map<string, Entry>();

let socket: WebSocket | null = null;
let socketOpen = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

function streamOf(symbol: string, interval: string): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

function publish(entry: Entry, patch: Partial<LiveCandles>) {
  entry.snapshot = { ...entry.snapshot, ...patch };
  for (const listener of entry.listeners) listener();
}

function send(method: "SUBSCRIBE" | "UNSUBSCRIBE", streams: string[]) {
  if (!socketOpen || !socket || streams.length === 0) return;
  socket.send(JSON.stringify({ method, params: streams, id: ++requestId }));
}

function ensureSocket() {
  if (socket || typeof window === "undefined") return;
  socket = new WebSocket(STREAM_URL);
  socket.onopen = () => {
    socketOpen = true;
    const active = [...entries.values()].filter((e) => e.listeners.size > 0);
    for (const entry of active) entry.subscribed = true;
    send("SUBSCRIBE", active.map((e) => e.stream));
    // Refill any gap that opened while the socket was down.
    for (const entry of active) {
      if (entry.snapshot.candles) loadHistory(entry);
      else publish(entry, { live: true });
    }
  };
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const k = msg?.data?.k;
    const entry = k && entries.get(msg.stream);
    if (!entry) return;
    merge(entry, {
      time: Number(k.t),
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      takerBuyVolume: Number(k.V),
    });
  };
  socket.onerror = () => socket?.close();
  socket.onclose = () => {
    socket = null;
    socketOpen = false;
    for (const entry of entries.values()) {
      entry.subscribed = false;
      if (entry.snapshot.live) publish(entry, { live: false });
    }
    if ([...entries.values()].some((e) => e.listeners.size > 0)) {
      retry = setTimeout(ensureSocket, RETRY_MS);
    }
  };
}

function merge(entry: Entry, candle: Candle) {
  const candles = entry.snapshot.candles;
  if (!candles) return;
  const last = candles[candles.length - 1];
  if (candle.time < last.time) return;
  const next =
    candle.time === last.time
      ? [...candles.slice(0, -1), candle]
      : [...candles.slice(candles.length >= HISTORY ? 1 : 0), candle];
  publish(entry, { candles: next, live: true });
}

async function loadHistory(entry: Entry) {
  if (entry.loading) return;
  entry.loading = true;
  try {
    const candles = await fetchCandles(entry.symbol, entry.interval, HISTORY);
    publish(entry, { candles, error: false, live: socketOpen && entry.subscribed });
  } catch {
    publish(entry, { error: entry.snapshot.candles === null });
    if (entry.listeners.size > 0) setTimeout(() => loadHistory(entry), RETRY_MS);
  } finally {
    entry.loading = false;
  }
}

export function subscribeLive(symbol: string, interval: string, listener: () => void): () => void {
  const stream = streamOf(symbol, interval);
  let entry = entries.get(stream);
  if (!entry) {
    entry = { symbol, interval, stream, snapshot: EMPTY, listeners: new Set(), loading: false, subscribed: false };
    entries.set(stream, entry);
  }
  clearTimeout(entry.linger);
  entry.listeners.add(listener);
  if (!entry.snapshot.candles) loadHistory(entry);
  ensureSocket();
  if (!entry.subscribed && socketOpen) {
    entry.subscribed = true;
    send("SUBSCRIBE", [stream]);
  }

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0) return;
    entry.linger = setTimeout(() => {
      if (entry.listeners.size > 0) return;
      if (entry.subscribed) send("UNSUBSCRIBE", [stream]);
      entries.delete(stream);
      if (entries.size === 0) {
        clearTimeout(retry);
        socket?.close();
      }
    }, LINGER_MS);
  };
}

export function getLive(symbol: string, interval: string): LiveCandles {
  return entries.get(streamOf(symbol, interval))?.snapshot ?? EMPTY;
}

// Candles for one chart that update on every Binance tick.
export function useLiveCandles(symbol: string, interval: string): LiveCandles {
  const subscribe = useCallback(
    (listener: () => void) => subscribeLive(symbol, interval, listener),
    [symbol, interval],
  );
  const getSnapshot = useCallback(() => getLive(symbol, interval), [symbol, interval]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
