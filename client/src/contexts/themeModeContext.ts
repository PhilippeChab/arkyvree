/** The theme's context: what `useThemeMode` hands a component, which `ThemeModeProvider` provides. */

import { createContext } from "react";

interface ThemeModeContextType {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

/** How the app picks its theme: light, dark, or the system's. */
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_MODES = ["light", "dark", "system"] as const;

export const ThemeModeContext = createContext<ThemeModeContextType | undefined>(undefined);
