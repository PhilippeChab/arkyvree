/** The theme's context: what `useThemeMode` hands a component, which `CustomThemeProvider` provides. */

import { createContext } from "react";

interface ThemeContextType {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

export type ThemeMode = "light" | "dark" | "system";

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
