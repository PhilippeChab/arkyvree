/** The theme's context: what `useThemeMode` hands a component, which `CustomThemeProvider` provides. */

import { createContext } from "react";

interface ThemeContextType {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

/** How the app picks its theme: light, dark, or the system's. */
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_MODES = ["light", "dark", "system"] as const;

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
