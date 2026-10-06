import Link from "next/link";
import { redirect } from "next/navigation";
import AccessSettings from "@/components/AccessSettings";
import { getAccess } from "@/lib/access";

export default async function AdminPage() {
  const access = await getAccess();
  if (!access) redirect("/sign-in");
  if (!access.isOwner) redirect("/");

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
      <AccessSettings />
    </main>
  );
}
