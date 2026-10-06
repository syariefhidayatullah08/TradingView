"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  approved: boolean;
  owner: boolean;
};

type Data = { users: UserRow[]; allowlist: string[] };

export default function AccessSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Bumped after every change so the effect below reloads the list.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setData(json);
        setEmails(json.allowlist.join("\n"));
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat daftar pengguna");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function approve(userId: string, approved: boolean) {
    setBusy(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, approved }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah akses");
    } finally {
      setBusy(null);
    }
  }

  async function saveAllowlist() {
    setBusy("allowlist");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      reload();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan daftar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">{error}</p>}

      <section className="panel">
        <header className="panel-header">
          <h2>Pengguna terdaftar</h2>
          <span className="text-xs text-muted">{data ? `${data.users.length} akun` : "Memuat…"}</span>
        </header>
        {data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-2 py-2 text-left font-medium">Daftar</th>
                <th className="px-2 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">{u.email}</div>
                    {u.name && <div className="text-[11px] text-muted">{u.name}</div>}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted">
                    {new Date(u.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                  </td>
                  <td className="px-2 py-2 text-xs font-semibold">
                    {u.owner ? (
                      <span className="text-accent-soft">Pemilik</span>
                    ) : u.approved ? (
                      <span className="text-up">Disetujui</span>
                    ) : (
                      <span className="text-amber-600">Menunggu</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!u.owner && (
                      <button
                        disabled={busy === u.id}
                        onClick={() => approve(u.id, !u.approved)}
                        className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
                          u.approved ? "border border-line hover:bg-base" : "btn-active text-white hover:opacity-90"
                        }`}
                      >
                        {u.approved ? "Cabut akses" : "Setujui"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Email yang boleh masuk</h2>
          <span className="text-xs text-muted">Disetujui otomatis saat pertama kali login</span>
        </header>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-xs text-muted">
            Satu email per baris. Orang yang mendaftar dengan email ini langsung bisa masuk tanpa menunggu
            persetujuan. Pengguna yang sudah disetujui di tabel atas tidak perlu ditulis lagi.
          </p>
          <textarea
            value={emails}
            onChange={(e) => {
              setEmails(e.target.value);
              setSaved(false);
            }}
            rows={6}
            className="w-full rounded border border-line bg-base p-2 font-mono text-xs"
            placeholder="nama@contoh.com"
          />
          <div className="flex items-center gap-3">
            <button
              disabled={busy === "allowlist" || !data}
              onClick={saveAllowlist}
              className="rounded btn-active px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Simpan daftar
            </button>
            {saved && <span className="text-xs text-up">Tersimpan</span>}
          </div>
        </div>
      </section>
    </div>
  );
}
