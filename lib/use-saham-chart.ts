"use client";

import { useEffect, useState } from "react";
import type { SahamChart } from "./saham";

export type SahamTf = "1m" | "5m" | "15m" | "1h" | "1d" | "1wk";

// IDX regular sessions in WIB: Mon–Thu 09:00–12:00 & 13:30–16:00, Fri 09:00–11:30 & 14:00–16:00.
export function idxSession(now = new Date()): { text: string; open: boolean } {
  const wib = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60_000);
  const day = wib.getDay();
  const min = wib.getHours() * 60 + wib.getMinutes();
  if (day === 0 || day === 6) return { text: "Bursa tutup (akhir pekan)", open: false };
  const fri = day === 5;
  const s1 = [540, fri ? 690 : 720];
  const s2 = [fri ? 840 : 810, 960];
  if (min >= s1[0] && min < s1[1]) return { text: "Sesi 1 berjalan", open: true };
  if (min >= s2[0] && min < s2[1]) return { text: "Sesi 2 berjalan", open: true };
  if (min >= s1[1] && min < s2[0]) return { text: "Istirahat siang", open: false };
  return { text: "Bursa tutup", open: false };
}

type State = { key: string; data: SahamChart | null; error: string | null };

// Candles and quote for one IDX code ("IHSG" for the index), refreshed every 15 s while the
// exchange trades and every 5 minutes otherwise. Data and error belong to the current code+tf only.
export function useSahamChart(code: string, tf: SahamTf) {
  const key = `${code}:${tf}`;
  const [state, setState] = useState<State>({ key: "", data: null, error: null });
  const [session, setSession] = useState(() => idxSession());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const s = idxSession();
      setSession(s);
      try {
        const res = await fetch(`/api/saham/chart?code=${code}&tf=${tf}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (!cancelled) setState({ key, data: j, error: null });
      } catch (e) {
        if (!cancelled) {
          setState((p) => ({
            key,
            data: p.key === key ? p.data : null,
            error: e instanceof Error ? e.message : "Gagal memuat chart",
          }));
        }
      }
      if (!cancelled) timer = setTimeout(load, s.open ? 15_000 : 300_000);
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, tf, key]);

  const current = state.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, session, key };
}
