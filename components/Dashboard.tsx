"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import AiAnalysisPanel from "./AiAnalysisPanel";
import AnalysisPanel from "./AnalysisPanel";
import BuySellPanel from "./BuySellPanel";
import CoinSentiment from "./CoinSentiment";
import FundamentalPanel from "./FundamentalPanel";
import MarketDirection from "./MarketDirection";
import MarketTable from "./MarketTable";
import NewsPanel from "./NewsPanel";
import RealtimeCharts from "./RealtimeCharts";
import SettingsPanel from "./SettingsPanel";
import SignalsOverview from "./SignalsOverview";
import TokocryptoCard from "./TokocryptoCard";
import TVWidget from "./TVWidget";
import { COINS, TIMEFRAMES, type Coin, type Timeframe } from "@/lib/symbols";

const TICKER_CONFIG = {
  symbols: [
    ...COINS.slice(0, 5).map((c) => ({ proName: `BINANCE:${c.symbol}`, title: c.name })),
    { proName: "OANDA:XAUUSD", title: "Emas" },
    { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
    { proName: "FX_IDC:USDIDR", title: "USD/IDR" },
  ],
  showSymbolLogo: true,
  isTransparent: true,
  displayMode: "adaptive",
  colorTheme: "dark",
  locale: "id",
};

const CALENDAR_CONFIG = {
  colorTheme: "dark",
  isTransparent: true,
  width: "100%",
  height: "100%",
  locale: "id",
  importanceFilter: "0,1",
  countryFilter: "us,eu,cn,jp,gb,id",
};

const TABS = [
  { id: "ai", label: "Analisa AI" },
  { id: "realtime", label: "Chart Real-Time" },
  { id: "teknikal", label: "Analisa Teknikal" },
  { id: "sinyal", label: "Sinyal Beli/Jual" },
  { id: "fundamental", label: "Analisa Fundamental" },
  { id: "berita", label: "Berita Dunia" },
  { id: "kalender", label: "Kalender Ekonomi" },
  { id: "pengaturan", label: "Pengaturan" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Dashboard({ isOwner = false }: { isOwner?: boolean }) {
  const [coin, setCoin] = useState<Coin>(COINS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>(TIMEFRAMES[1]);
  const [tab, setTab] = useState<TabId>("ai");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <div className="flex w-full flex-col gap-2 p-2">
      <header className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <h1 className="text-base font-bold tracking-tight">
          Kripto<span className="text-accent-soft">Scope</span>
        </h1>
        <select
          value={coin.symbol}
          onChange={(e) => setCoin(COINS.find((c) => c.symbol === e.target.value) ?? COINS[0])}
          className="rounded border border-line bg-base px-2 py-1.5 text-sm font-semibold"
          aria-label="Pilih koin"
        >
          {COINS.map((c) => (
            <option key={c.symbol} value={c.symbol}>
              {c.base}USDT — {c.name}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-line">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.tv}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1.5 text-xs font-medium ${
                tf.tv === timeframe.tv ? "bg-accent text-white" : "bg-base text-muted hover:text-fg"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 basis-80 overflow-hidden">
          <TVWidget script="ticker-tape" config={TICKER_CONFIG} height={46} />
        </div>
        <button
          onClick={() => setTab("pengaturan")}
          className="rounded border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-base"
        >
          {isOwner ? "Kelola akses" : "Pengaturan"}
        </button>
        <UserButton />
      </header>

      <section
        className={
          fullscreen ? "fixed inset-0 z-50 flex flex-col bg-panel" : "panel flex flex-col overflow-hidden"
        }
        style={fullscreen ? undefined : { height: "max(680px, calc(100vh - 16px))" }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          <span className="text-sm font-semibold">
            {coin.base}/USDT <span className="font-normal text-muted">· {coin.name}</span>
          </span>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="rounded border border-line px-2.5 py-1 text-xs font-medium hover:bg-base"
          >
            {fullscreen ? "✕ Tutup layar penuh (Esc)" : "⛶ Layar penuh"}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <TVWidget
            script="advanced-chart"
            height="100%"
            config={{
              autosize: true,
              symbol: `BINANCE:${coin.symbol}`,
              interval: timeframe.tv,
              timezone: "Asia/Jakarta",
              theme: "dark",
              style: "1",
              locale: "id",
              allow_symbol_change: false,
              hide_side_toolbar: false,
              studies: ["STD;RSI", "STD;MACD"],
              support_host: "https://www.tradingview.com",
            }}
          />
        </div>
      </section>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-w-0 flex-col gap-2">
          <nav className="panel flex flex-wrap gap-1 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  tab === t.id ? "bg-accent text-white" : "text-muted hover:bg-base hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "ai" && <AiAnalysisPanel coin={coin} />}
          {tab === "realtime" && (
            <RealtimeCharts timeframe={timeframe} selected={coin.symbol} onSelect={setCoin} />
          )}
          {tab === "teknikal" && <MarketDirection coin={coin} />}
          {tab === "sinyal" && (
            <>
              <SignalsOverview timeframe={timeframe} selected={coin.symbol} onSelect={setCoin} />
              <BuySellPanel coin={coin} timeframe={timeframe} />
            </>
          )}
          {tab === "teknikal" && (
            <div className="grid gap-2 md:grid-cols-2">
              <AnalysisPanel coin={coin} timeframe={timeframe} />
              <section className="panel overflow-hidden">
                <header className="panel-header">
                  <h2>Rating Teknikal TradingView</h2>
                  <span className="text-xs text-muted">Pembanding</span>
                </header>
                <TVWidget
                  script="technical-analysis"
                  height={460}
                  config={{
                    interval: timeframe.gauge,
                    width: "100%",
                    height: "100%",
                    isTransparent: true,
                    symbol: `BINANCE:${coin.symbol}`,
                    showIntervalTabs: true,
                    displayMode: "single",
                    locale: "id",
                    colorTheme: "dark",
                  }}
                />
              </section>
            </div>
          )}
          {tab === "fundamental" && <FundamentalPanel coin={coin} />}
          {tab === "pengaturan" && <SettingsPanel isOwner={isOwner} />}
          {tab === "berita" && <NewsPanel />}
          {tab === "kalender" && (
            <section className="panel overflow-hidden">
              <header className="panel-header">
                <h2>Kalender Ekonomi</h2>
                <span className="text-xs text-muted">Rilis data penting</span>
              </header>
              <TVWidget script="events" config={CALENDAR_CONFIG} height={560} />
            </section>
          )}
        </main>

        <aside className="flex flex-col gap-2">
          <CoinSentiment coin={coin} timeframe={timeframe} />
          <TokocryptoCard coin={coin} />
          <MarketTable selected={coin.symbol} onSelect={setCoin} />
        </aside>
      </div>

      <footer className="px-1 pb-2 text-[11px] text-muted">
        Data harga: Binance &amp; Tokocrypto · Fundamental: CoinGecko · Chart &amp; kalender: TradingView ·
        Berita: CNBC, MarketWatch, Investing.com, The Guardian, Bloomberg, The Fed, BBC, Financial Times, Al
        Jazeera, Antara, CNBC Indonesia, CoinDesk, Cointelegraph, Decrypt, The Block, Cryptonews. Bukan saran
        keuangan.
      </footer>
    </div>
  );
}
