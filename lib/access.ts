import { clerkClient, currentUser } from "@clerk/nextjs/server";

// The owner is whoever signs in with this verified email. They approve everyone else.
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

export type Access = {
  userId: string;
  email: string;
  isOwner: boolean;
  allowed: boolean;
};

export function isOwnerEmail(email: string): boolean {
  return OWNER_EMAIL !== "" && email.toLowerCase() === OWNER_EMAIL;
}

async function ownerUser() {
  if (!OWNER_EMAIL) return null;
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ emailAddress: [OWNER_EMAIL], limit: 10 });
  return data.find((u) => u.primaryEmailAddress?.emailAddress.toLowerCase() === OWNER_EMAIL) ?? null;
}

// Emails the owner pre-approved; they are approved automatically on first sign-in.
export async function getAllowlist(): Promise<string[]> {
  const owner = await ownerUser();
  const list = owner?.privateMetadata.allowedEmails;
  return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string") : [];
}

export async function setAllowlist(emails: string[]): Promise<void> {
  const owner = await ownerUser();
  if (!owner) throw new Error("Akun pemilik belum terdaftar");
  const client = await clerkClient();
  await client.users.updateUserMetadata(owner.id, { privateMetadata: { allowedEmails: emails } });
}

export async function setApproved(userId: string, approved: boolean): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { approved } });
}

export async function getAccess(): Promise<Access | null> {
  const user = await currentUser();
  if (!user) return null;
  const primary = user.primaryEmailAddress;
  const verified = primary?.verification?.status === "verified";
  const email = verified ? (primary?.emailAddress.toLowerCase() ?? "") : "";
  const isOwner = email !== "" && isOwnerEmail(email);
  let allowed = isOwner || user.publicMetadata.approved === true;

  if (!allowed && email) {
    const allowlist = await getAllowlist();
    if (allowlist.includes(email)) {
      await setApproved(user.id, true);
      allowed = true;
    }
  }

  return { userId: user.id, email, isOwner, allowed };
}

// For API routes: a Response to return when the caller may not use the app, else null.
export async function denyUnlessAllowed(): Promise<Response | null> {
  const access = await getAccess();
  if (access?.allowed) return null;
  return Response.json({ error: "Akun belum disetujui pemilik aplikasi" }, { status: 403 });
}
