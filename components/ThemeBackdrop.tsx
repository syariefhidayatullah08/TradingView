"use client";

import MountainBackdrop from "./backdrops/MountainBackdrop";
import NinjaBackdrop from "./backdrops/NinjaBackdrop";
import ProBackdrop from "./backdrops/ProBackdrop";
import NightBackdrop from "./NightBackdrop";
import { useTheme } from "@/lib/theme";

// The live backdrop of the active theme. Rendered only in the browser, where the theme is known;
// the body background color of the theme shows until then.
export default function ThemeBackdrop() {
  const theme = useTheme();
  if (theme === "pro") return <ProBackdrop />;
  if (theme === "gunung") return <MountainBackdrop />;
  if (theme === "ninja") return <NinjaBackdrop />;
  if (theme === "malam") return <NightBackdrop />;
  return null;
}
