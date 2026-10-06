import { clerkClient } from "@clerk/nextjs/server";
import { getAccess, getAllowlist, isOwnerEmail, setAllowlist, setApproved } from "@/lib/access";

async function denyUnlessOwner(): Promise<Response | null> {
  const access = await getAccess();
  if (access?.isOwner) return null;
  return Response.json({ error: "Hanya pemilik aplikasi yang boleh mengelola akses" }, { status: 403 });
}

export async function GET() {
  const denied = await denyUnlessOwner();
  if (denied) return denied;

  const client = await clerkClient();
  const [{ data }, allowlist] = await Promise.all([
    client.users.getUserList({ limit: 200, orderBy: "-created_at" }),
    getAllowlist(),
  ]);
  const users = data.map((u) => {
    const email = u.primaryEmailAddress?.emailAddress ?? "";
    return {
      id: u.id,
      email: email || "(tanpa email)",
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      createdAt: u.createdAt,
      approved: u.publicMetadata.approved === true,
      owner: email !== "" && isOwnerEmail(email),
    };
  });
  return Response.json({ users, allowlist });
}

export async function POST(request: Request) {
  const denied = await denyUnlessOwner();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return Response.json({ error: "userId wajib diisi" }, { status: 400 });
  await setApproved(userId, body.approved === true);
  return Response.json({ ok: true });
}

export async function PUT(request: Request) {
  const denied = await denyUnlessOwner();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const emails = String(body?.emails ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  await setAllowlist([...new Set(emails)]);
  return Response.json({ ok: true, count: emails.length });
}
