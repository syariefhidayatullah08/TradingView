// Visual themes. Colors live in globals.css under html[data-theme=…]; each theme also has
// its own live backdrop (components/ThemeBackdrop.tsx). The choice is a per-device preference.

export const THEMES = [
  { id: "malam", label: "Malam Berbintang", icon: "🌙", chartBg: "#0d1330" },
  { id: "pro", label: "Trading Pro", icon: "📈", chartBg: "#0b0e14" },
  { id: "gunung", label: "Pegunungan", icon: "⛰️", chartBg: "#0c1f19" },
  { id: "ninja", label: "Anime Ninja", icon: "🍃", chartBg: "#1a1025" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_KEY = "kriptoscope:theme";
export const DEFAULT_THEME: ThemeId = "malam";

// Runs before the page paints (inlined in the layout) so the right colors show on the first frame.
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(${JSON.stringify(
  THEMES.map((t) => t.id),
)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;

export function themeInfo(id: ThemeId | null) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
