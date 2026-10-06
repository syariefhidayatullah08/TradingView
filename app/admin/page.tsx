import { clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess, getAllowlist, isOwnerEmail } from "@/lib/access";
import { approveUser, saveAllowlist } from "./actions";

export default async function AdminPage() {
  const access = await getAccess();
  if (!access) redirect("/sign-in");
  if (!access.isOwner) redirect("/");

  const client = await clerkClient();
  const [{ data: users }, allowlist] = await Promise.all([
    client.users.getUserList({ limit: 200, orderBy: "-created_at" }),
    getAllowlist(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3">
      <header className="panel flex items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-base font-bold">Kelola Akses</h1>
          <p className="text-xs text-muted">Pemilik: {access.email}</p>
        </div>
        <Link href="/" className="rounded border border-line px-3 py-1.5 text-xs font-medium hover:bg-base">
          ← Kembali ke aplikasi
        </Link>
      </header>

      <section className="panel">
        <header className="panel-header">
          <h2>Pengguna terdaftar</h2>
          <span className="text-xs text-muted">{users.length} akun</span>
        </header>
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
            {users.map((u) => {
              const email = u.primaryEmailAddress?.emailAddress ?? "(tanpa email)";
              const owner = isOwnerEmail(email);
              const approved = u.publicMetadata.approved === true;
              return (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">{email}</div>
                    {(u.firstName || u.lastName) && (
                      <div className="text-[11px] text-muted">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ")}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted">
                    {new Date(u.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                  </td>
                  <td className="px-2 py-2 text-xs font-semibold">
                    {owner ? (
                      <span className="text-accent-soft">Pemilik</span>
                    ) : approved ? (
                      <span className="text-up">Disetujui</span>
                    ) : (
                      <span className="text-yellow-400">Menunggu</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!owner && (
                      <form action={approveUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="approved" value={approved ? "false" : "true"} />
                        <button
                          className={`rounded px-2.5 py-1 text-xs font-semibold ${
                            approved ? "border border-line hover:bg-base" : "bg-accent text-white hover:opacity-90"
                          }`}
                        >
                          {approved ? "Cabut akses" : "Setujui"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Email yang boleh masuk</h2>
          <span className="text-xs text-muted">Disetujui otomatis saat pertama kali login</span>
        </header>
        <form action={saveAllowlist} className="flex flex-col gap-2 p-4">
          <p className="text-xs text-muted">
            Satu email per baris. Orang yang mendaftar dengan email ini langsung bisa masuk tanpa menunggu
            persetujuan. Pengguna yang sudah disetujui di tabel atas tidak perlu ditulis lagi.
          </p>
          <textarea
            name="emails"
            defaultValue={allowlist.join("\n")}
            rows={6}
            className="w-full rounded border border-line bg-base p-2 font-mono text-xs"
            placeholder="nama@contoh.com"
          />
          <div>
            <button className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Simpan daftar
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
