"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";

const REFRESH_MS = 2 * 60_000;

const TABS = [
  { id: "politik", label: "Politik & Dunia" },
  { id: "ekonomi", label: "Ekonomi" },
  { id: "fed", label: "The Fed & Suku Bunga" },
  { id: "crypto", label: "Crypto" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type State = {
  cat: TabId | "";
  items?: NewsItem[];
  failed?: string[];
  error?: string;
  fetchedAt: number;
};

function timeAgo(publishedAt: number, now: number): string {
  if (!publishedAt) return "";
  const minutes = Math.max(0, Math.round((now - publishedAt) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

export default function NewsPanel() {
  const [cat, setCat] = useState<TabId>("ekonomi");
  const [state, setState] = useState<State>({ cat: "", fetchedAt: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/news?cat=${cat}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) {
          setState({ cat, items: json.items, failed: json.failed, fetchedAt: Date.now() });
        }
      } catch (e) {
        if (!cancelled) {
          setState((prev) =>
            prev.cat === cat && prev.items
              ? prev
              : {
                  cat,
                  error: e instanceof Error ? e.message : "Berita gagal dimuat",
                  fetchedAt: Date.now(),
                },
          );
        }
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cat]);

  const current = state.cat === cat ? state : null;

  return (
    <section className="panel flex flex-col">
      <header className="panel-header flex-wrap gap-2">
        <h2>Berita Terbaru Dunia</h2>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCat(tab.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                cat === tab.id ? "bg-accent text-white" : "bg-base text-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {!current && <p className="p-4 text-sm text-muted">Memuat berita…</p>}
      {current?.error && <p className="p-4 text-sm text-down">{current.error}</p>}
      {current?.items && (
        <>
          {current.failed && current.failed.length > 0 && (
            <p className="border-b border-line px-4 py-2 text-xs text-muted">
              Sumber yang gagal dimuat: {current.failed.join(", ")}
            </p>
          )}
          <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
            {current.items.map((item) => (
              <li key={item.link}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 hover:bg-base"
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-base px-1.5 py-0.5 font-medium text-accent-soft">
                      {item.source}
                    </span>
                    <span className="text-muted">{timeAgo(item.publishedAt, current.fetchedAt)}</span>
                  </div>
                  <div className="text-sm font-medium leading-snug">{item.title}</div>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">
                      {item.description}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
