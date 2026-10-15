"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_KEY, THEMES, type ThemeId } from "./theme-config";

const listeners = new Set<() => void>();

function current(): ThemeId {
  const t = document.documentElement.dataset.theme;
  return THEMES.some((x) => x.id === t) ? (t as ThemeId) : DEFAULT_THEME;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {}
  listeners.forEach((l) => l());
}

// The active theme; null during server rendering, where it is not known yet.
export function useTheme(): ThemeId | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
