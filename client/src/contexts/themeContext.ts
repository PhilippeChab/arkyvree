/** The theme's context: what `useTheme` hands a component, which `CustomThemeProvider` provides. */

import { createContext } from "react";

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  darkMode: boolean;
}

export type ThemeMode = "light" | "dark" | "system";

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
