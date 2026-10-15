"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; linked: boolean; url: string | null; isOwner?: boolean };

// Connect this account to the KriptoScope Telegram bot for alerts while the app is closed.
export default function TelegramSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/telegram/link")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setStatus(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function unlink() {
    await fetch("/api/telegram/link", { method: "DELETE" }).catch(() => null);
    setVersion((v) => v + 1);
  }

  async function setup() {
    const res = await fetch("/api/telegram/setup", { method: "POST" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setMessage(res?.ok ? `Webhook aktif: ${json.url}` : (json?.error ?? "Gagal mengaktifkan webhook"));
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Notifikasi Telegram</h2>
        <span className="text-xs text-muted">Tetap jalan walau aplikasi ditutup</span>
      </header>
      <div className="flex flex-col gap-3 p-4 text-sm">
        {!status && <p className="text-muted">Memuat…</p>}
        {status && !status.configured && (
          <p className="text-muted">
            Bot Telegram belum disiapkan oleh pemilik aplikasi (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, dan
            CRON_SECRET di Vercel).
          </p>
        )}
        {status?.configured && status.linked && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-up">✓ Terhubung ke Telegram</span>
            <button onClick={unlink} className="rounded border border-line px-2.5 py-1 text-xs hover:bg-base">
              Putuskan
            </button>
          </div>
        )}
        {status?.configured && !status.linked && status.url && (
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={status.url}
              target="_blank"
              rel="noreferrer"
              className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white"
            >
              Hubungkan Telegram ↗
            </a>
            <span className="text-xs text-muted">
              Telegram akan terbuka; tekan <b>Start</b> di bot. Lalu{" "}
              <button onClick={() => setVersion((v) => v + 1)} className="underline">
                cek lagi
              </button>
              .
            </span>
          </div>
        )}
        <p className="text-[11px] text-muted">
          Pesan dikirim saat koin berubah jadi BELI (candle 4j di Mode Santai, 1j di mode normal), saat posisi Anda
          waktunya JUAL atau AMANKAN, dan pada jadwal DCA. Diperiksa sekitar setiap 15 menit.
        </p>
        {status?.isOwner && status.configured && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button onClick={setup} className="rounded border border-line px-2.5 py-1 text-xs hover:bg-base">
              Aktifkan webhook bot (pemilik, sekali saja)
            </button>
            {message && <span className="text-xs text-muted">{message}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
