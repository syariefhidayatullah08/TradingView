"use client";

import { setTheme, useTheme } from "@/lib/theme";
import { THEMES, type ThemeId } from "@/lib/theme-config";

export default function ThemeSwitcher() {
  const theme = useTheme();
  return (
    <select
      value={theme ?? ""}
      onChange={(e) => setTheme(e.target.value as ThemeId)}
      className="rounded border border-line bg-base px-2 py-1.5 text-xs font-medium"
      aria-label="Pilih tema"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.icon} {t.label}
        </option>
      ))}
    </select>
  );
}
