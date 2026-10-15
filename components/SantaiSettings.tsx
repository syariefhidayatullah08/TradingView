"use client";

import { useState } from "react";
import { SANTAI_MIN_CONFIDENCE, type SantaiSettings } from "@/lib/santai";
import { saveSantai, useSantai } from "@/lib/use-santai";

// Header switch for Mode Santai. `onEnable` lets the dashboard move to the plan's 4h candle.
export function SantaiToggle({ onEnable }: { onEnable: () => void }) {
  const { settings, loaded } = useSantai();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await saveSantai({ ...settings, enabled: !settings.enabled });
      if (!settings.enabled) onEnable();
    } catch {
      // The store already rolled back; the button shows the unchanged state.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={!loaded || busy}
      title="BTC/ETH/BNB, candle 4 jam, modal dibagi rata, jual di untung bersih tetap, tanpa stop loss"
      className={`rounded border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
        settings.enabled ? "border-up/50 bg-up/10 text-up" : "border-line hover:bg-base"
      }`}
    >
      🌿 Mode Santai{settings.enabled ? " aktif" : ""}
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[11px] text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1 block w-full rounded border border-line bg-base px-2 py-1.5 font-mono text-sm text-fg"
      />
      <span className="mt-0.5 block">{hint}</span>
    </label>
  );
}

function Form({ settings, idrPerUsdt }: { settings: SantaiSettings; idrPerUsdt: number | null }) {
  const [capital, setCapital] = useState(String(settings.capitalIdr));
  const [parts, setParts] = useState(String(settings.parts));
  const [target, setTarget] = useState(String(settings.targetPct));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const capitalIdr = Number(capital.replace(/[^\d]/g, ""));
  const partCount = Math.round(Number(parts));
  const targetPct = Number(target.replace(",", "."));
  const valid = capitalIdr >= 100_000 && partCount >= 1 && partCount <= 10 && targetPct >= 0.5 && targetPct <= 20;
  const perPart = valid ? capitalIdr / partCount : null;

  async function save() {
    setStatus("saving");
    try {
      await saveSantai({ ...settings, capitalIdr, parts: partCount, targetPct });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Modal trading (Rp)"
          hint="Uang dingin; juga dipakai manajer risiko"
          value={capital}
          onChange={(v) => {
            setCapital(v);
            setStatus("idle");
          }}
        />
        <Field
          label="Dibagi jadi berapa bagian"
          hint="Maksimal posisi terbuka sekaligus (1–10)"
          value={parts}
          onChange={(v) => {
            setParts(v);
            setStatus("idle");
          }}
        />
        <Field
          label="Target untung bersih (%)"
          hint="Setelah biaya Tokocrypto (0,5–20)"
          value={target}
          onChange={(v) => {
            setTarget(v);
            setStatus("idle");
          }}
        />
      </div>
      {perPart && (
        <p className="text-xs">
          Setiap beli: <b>Rp {Math.round(perPart).toLocaleString("id-ID")}</b>
          {idrPerUsdt && <> ≈ <b>${(perPart / idrPerUsdt).toFixed(2)} USDT</b></>}. Untung per transaksi ≈ Rp{" "}
          {Math.round((perPart * targetPct) / 100).toLocaleString("id-ID")}.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!valid || status === "saving"}
          className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Simpan
        </button>
        {status === "saved" && <span className="text-xs text-up">Tersimpan</span>}
        {status === "error" && <span className="text-xs text-down">Gagal menyimpan</span>}
        {!valid && <span className="text-xs text-down">Periksa isian: modal minimal Rp 100.000</span>}
      </div>
      <ul className="list-disc pl-4 text-[11px] text-muted">
        <li>Hanya BTC, ETH, dan BNB, memakai candle 4 jam.</li>
        <li>BELI hanya jika keyakinan minimal {SANTAI_MIN_CONFIDENCE}%, satu posisi per koin.</li>
        <li>Tanpa stop loss: posisi ditahan sampai target, walaupun sempat minus.</li>
        <li>
          Uji 4 bulan terakhir: sebagian besar pembelian terjual untung dalam beberapa hari, tetapi pembelian
          sebelum pasar turun bisa tertahan minus berminggu-minggu. Bukan jaminan untung.
        </li>
      </ul>
    </div>
  );
}

export default function SantaiSettingsPanel() {
  const { settings, loaded, idrPerUsdt } = useSantai();
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Mode Santai</h2>
        <span className="text-xs text-muted">{settings.enabled ? "Aktif" : "Nonaktif"}</span>
      </header>
      {loaded ? (
        // Mounted only after the saved settings load, so the fields start from them.
        <Form settings={settings} idrPerUsdt={idrPerUsdt} />
      ) : (
        <p className="p-4 text-sm text-muted">Memuat…</p>
      )}
    </section>
  );
}

const STRATEGY: { key: "trailing" | "sensitive" | "btcFilter"; label: string; hint: string }[] = [
  {
    key: "trailing",
    label: "Trailing stop setelah target",
    hint: "Setelah target tercapai, tahan selama harga naik; jual saat turun 1 ATR dari puncak. Di uji 10 koin, ini yang paling menaikkan hasil.",
  },
  {
    key: "sensitive",
    label: "Mode Sensitif",
    hint: "BELI lebih cepat dengan sinyal lebih lemah. Lebih sering trading, tetapi di uji hasilnya tidak lebih baik. Coba dulu di Akun Demo.",
  },
  {
    key: "btcFilter",
    label: "Filter arah pasar BTC",
    hint: "Tahan BELI saat BTC harian sedang turun. Di uji 10 koin tidak menaikkan hasil; berguna jika ingin lebih hati-hati.",
  },
];

// On/off switches for the strategy, saved immediately to the account.
export function StrategySettings() {
  const { settings, loaded } = useSantai();
  const [error, setError] = useState(false);

  async function toggle(key: (typeof STRATEGY)[number]["key"]) {
    setError(false);
    try {
      await saveSantai({ ...settings, [key]: !settings[key] });
    } catch {
      setError(true);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Strategi Trading</h2>
        <span className="text-xs text-muted">Berlaku di Mulai Trading, Pemindai, notifikasi, dan Uji Strategi</span>
      </header>
      <div className="flex flex-col gap-3 p-4">
        {STRATEGY.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={settings[s.key]}
              disabled={!loaded}
              onChange={() => toggle(s.key)}
              className="mt-0.5 h-4 w-4 accent-[var(--t-accent)]"
            />
            <span>
              <span className="text-sm font-medium">{s.label}</span>
              <span className="block text-[11px] text-muted">{s.hint}</span>
            </span>
          </label>
        ))}
        {error && <span className="text-xs text-down">Gagal menyimpan, coba lagi</span>}
      </div>
    </section>
  );
}

// Risk manager settings; the capital itself is set in the Mode Santai card.
export function RiskSettingsPanel() {
  const { settings, loaded } = useSantai();
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Manajemen Risiko</h2>
        <span className="text-xs text-muted">Modal: Rp {settings.capitalIdr.toLocaleString("id-ID")}</span>
      </header>
      {loaded ? <RiskForm settings={settings} /> : <p className="p-4 text-sm text-muted">Memuat…</p>}
    </section>
  );
}

function RiskForm({ settings }: { settings: SantaiSettings }) {
  const [risk, setRisk] = useState(String(settings.riskPct));
  const [weekly, setWeekly] = useState(String(settings.weeklyLossPct));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const riskPct = Number(risk.replace(",", "."));
  const weeklyLossPct = Number(weekly.replace(",", "."));
  const valid = riskPct >= 0.25 && riskPct <= 5 && weeklyLossPct >= 1 && weeklyLossPct <= 30;

  async function save() {
    setStatus("saving");
    try {
      await saveSantai({ ...settings, riskPct, weeklyLossPct });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Risiko per trade (% modal)"
          hint="Rugi maksimal jika stop loss kena (0,25–5). Trader profesional: 1–2%"
          value={risk}
          onChange={(v) => {
            setRisk(v);
            setStatus("idle");
          }}
        />
        <Field
          label="Rem rugi mingguan (% modal)"
          hint="Jika rugi minggu ini melewati ini, BELI dikunci sampai Senin (1–30)"
          value={weekly}
          onChange={(v) => {
            setWeekly(v);
            setStatus("idle");
          }}
        />
      </div>
      {valid && (
        <p className="text-xs">
          Rugi maksimal per trade ≈ Rp {Math.round((settings.capitalIdr * riskPct) / 100).toLocaleString("id-ID")}; BELI
          dikunci setelah rugi ≈ Rp {Math.round((settings.capitalIdr * weeklyLossPct) / 100).toLocaleString("id-ID")}{" "}
          dalam seminggu.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!valid || status === "saving"}
          className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Simpan
        </button>
        {status === "saved" && <span className="text-xs text-up">Tersimpan</span>}
        {status === "error" && <span className="text-xs text-down">Gagal menyimpan</span>}
      </div>
      <p className="text-[11px] text-muted">
        Ukuran posisi dihitung di jendela Mulai Trading (mode normal). Mode Santai memakai pembagian modal rata. Rem
        mingguan memakai transaksi yang sudah dijual dan dicatat jumlah koinnya.
      </p>
    </div>
  );
}
