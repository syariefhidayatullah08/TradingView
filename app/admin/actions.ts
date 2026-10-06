"use server";

import { revalidatePath } from "next/cache";
import { getAccess, setAllowlist, setApproved } from "@/lib/access";

async function requireOwner() {
  const access = await getAccess();
  if (!access?.isOwner) throw new Error("Hanya pemilik aplikasi yang boleh melakukan ini");
}

export async function approveUser(formData: FormData): Promise<void> {
  await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const approved = formData.get("approved") === "true";
  if (!userId) return;
  await setApproved(userId, approved);
  revalidatePath("/admin");
}

export async function saveAllowlist(formData: FormData): Promise<void> {
  await requireOwner();
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  await setAllowlist([...new Set(emails)]);
  revalidatePath("/admin");
}
