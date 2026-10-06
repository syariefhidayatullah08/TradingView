"use client";

import { UserProfile } from "@clerk/nextjs";
import AccessSettings from "./AccessSettings";

export default function SettingsPanel({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {isOwner ? (
        <AccessSettings />
      ) : (
        <p className="panel px-4 py-3 text-xs text-muted">
          Pengaturan akses pengguna hanya tersedia untuk pemilik aplikasi.
        </p>
      )}

      <section className="panel overflow-hidden">
        <header className="panel-header">
          <h2>Akun saya</h2>
          <span className="text-xs text-muted">Email, kata sandi, keamanan</span>
        </header>
        <div className="p-2">
          <UserProfile routing="hash" />
        </div>
      </section>
    </div>
  );
}
