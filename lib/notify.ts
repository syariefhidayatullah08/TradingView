"use client";

import { useSyncExternalStore } from "react";

// Trade alerts: a system notification when the browser allows it, plus an in-app toast.
// The on/off switch is a per-device preference, so it lives in localStorage.

export type Toast = { id: number; title: string; body: string; tone: "up" | "down" | "info" };

const PREF_KEY = "kriptoscope:alerts";
const TOAST_MS = 12_000;
const MAX_TOASTS = 4;

let enabled = false;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

try {
  enabled = typeof window !== "undefined" && window.localStorage.getItem(PREF_KEY) === "1";
} catch {
  enabled = false;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAlertsEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => false);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => toasts);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

// Turns alerts on, asking for notification permission. Returns whether system
// notifications will show (in-app toasts work either way).
export async function enableAlerts(): Promise<boolean> {
  enabled = true;
  try {
    window.localStorage.setItem(PREF_KEY, "1");
  } catch {}
  emit();
  if (!("Notification" in window)) return false;
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") await registration();
  return permission === "granted";
}

export function disableAlerts() {
  enabled = false;
  try {
    window.localStorage.setItem(PREF_KEY, "0");
  } catch {}
  emit();
}

export async function notify(title: string, body: string, tone: Toast["tone"], tag: string) {
  const toast = { id: nextId++, title, body, tone };
  toasts = [toast, ...toasts].slice(0, MAX_TOASTS);
  emit();
  setTimeout(() => dismissToast(toast.id), TOAST_MS);

  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" };
  // Mobile browsers only allow notifications through a service worker.
  const reg = await registration();
  if (reg) {
    await reg.showNotification(title, options).catch(() => {});
    return;
  }
  try {
    new Notification(title, options);
  } catch {}
}
