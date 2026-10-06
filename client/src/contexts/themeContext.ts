/** The theme's context: what `useTheme` hands a component, which `CustomThemeProvider` provides. */

import { createContext } from "react";

import type { ThemeMode } from "@/client/src/stores/themeMode.ts";

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  darkMode: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
