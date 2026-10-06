export type ThemeMode = "light" | "dark" | "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * The theme mode an earlier version kept under keys of its own: what the store starts from until it holds one. They're
 * read, never dropped, since the store only writes itself once a preference changes.
 */
export function legacyThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("themeMode");
    const legacyDarkMode = localStorage.getItem("darkMode");
    if (isThemeMode(saved)) return saved;
    if (legacyDarkMode !== null) return JSON.parse(legacyDarkMode) === true ? "dark" : "light";
  } catch {
    // Storage disabled or the old value corrupted
  }
  return "system";
}
