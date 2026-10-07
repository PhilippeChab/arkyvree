import type { ThemeMode } from "@/client/src/contexts/themeContext.ts";

/** The theme mode the browser kept, or "system"; a legacy `darkMode` flag is read once and dropped. */
export function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("themeMode");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;

    // Migrate legacy darkMode preference
    const legacyDarkMode = localStorage.getItem("darkMode");
    if (legacyDarkMode !== null) {
      localStorage.removeItem("darkMode");
      return JSON.parse(legacyDarkMode) === true ? "dark" : "light";
    }
  } catch {
    // Ignore corrupted localStorage
  }
  return "system";
}

/** Keeps the theme mode the user chose. */
export function saveThemeMode(mode: ThemeMode) {
  localStorage.setItem("themeMode", mode);
}
