import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import Dashboard from "@/components/Dashboard";
import { getAccess } from "@/lib/access";

export default async function Home() {
  const access = await getAccess();
  if (!access) redirect("/sign-in");

  if (!access.allowed) {
    return (
      <AuthShell>
        <div className="panel max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold">Menunggu persetujuan</h2>
          <p className="mt-2 text-sm text-muted">
            Akun <span className="font-mono text-fg">{access.email || "Anda"}</span> sudah terdaftar, tetapi
            hanya pengguna yang disetujui pemilik aplikasi yang bisa masuk. Hubungi pemilik aplikasi, lalu
            buka kembali halaman ini setelah disetujui.
          </p>
          <div className="mt-4">
            <SignOutButton>
              <button className="rounded border border-line px-3 py-1.5 text-xs font-medium hover:bg-base">
                Keluar
              </button>
            </SignOutButton>
          </div>
        </div>
      </AuthShell>
    );
  }

  return <Dashboard isOwner={access.isOwner} />;
}
