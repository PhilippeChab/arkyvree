import type { ThemeMode } from "@/client/src/contexts/themeContext.ts";

import { readStored, removeStored, writeStored } from "./browserStorage.ts";

/** The theme mode the browser kept, or "system"; a legacy `darkMode` flag is read once and dropped. */
export function readThemeMode(): ThemeMode {
  const saved = readStored("local", "themeMode");
  if (saved === "light" || saved === "dark" || saved === "system") return saved;

  // Migrate legacy darkMode preference
  const legacyDarkMode = readStored("local", "darkMode");
  if (legacyDarkMode === null) return "system";
  removeStored("local", "darkMode");
  return legacyDarkMode === "true" ? "dark" : "light";
}

/** Keeps the theme mode the user chose, where the browser keeps anything. */
export function saveThemeMode(mode: ThemeMode) {
  writeStored("local", "themeMode", mode);
}
