"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_SANTAI, type SantaiSettings } from "./santai";

// Mode Santai settings and the USDT/IDR rate, loaded once and shared by every component.

type State = { settings: SantaiSettings; loaded: boolean; idrPerUsdt: number | null };

const RATE_REFRESH_MS = 5 * 60_000;

let state: State = { settings: DEFAULT_SANTAI, loaded: false, idrPerUsdt: null };
let started = false;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadRate() {
  try {
    const res = await fetch("/api/tokocrypto?base=USDT");
    const json = await res.json();
    if (res.ok) set({ idrPerUsdt: (json.bid + json.ask) / 2 });
  } catch {}
}

function start() {
  if (started) return;
  started = true;
  fetch("/api/santai")
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => set({ settings: json ?? DEFAULT_SANTAI, loaded: true }))
    .catch(() => set({ loaded: true }));
  loadRate();
  setInterval(loadRate, RATE_REFRESH_MS);
}

// Current settings for code that runs outside React rendering (timers).
export function getSantai(): SantaiSettings {
  return state.settings;
}

export async function saveSantai(settings: SantaiSettings): Promise<void> {
  const previous = state.settings;
  set({ settings });
  const res = await fetch("/api/santai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  }).catch(() => null);
  if (!res?.ok) {
    set({ settings: previous });
    throw new Error("Pengaturan Mode Santai gagal disimpan");
  }
  set({ settings: await res.json() });
}

export function useSantai(): State {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}
