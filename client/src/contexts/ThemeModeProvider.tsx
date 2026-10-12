import { ThemeProvider } from "@mui/material";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { readThemeMode, saveThemeMode } from "@/client/src/stores/themeModeStorage.ts";
import { createAppTheme } from "@/client/src/theme/appTheme.ts";

import { type ThemeMode, ThemeModeContext } from "./themeModeContext.ts";

interface ThemeModeProviderProps {
  children: ReactNode;
}

const PREFERS_DARK = "(prefers-color-scheme: dark)";

export function ThemeModeProvider({ children }: ThemeModeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia(PREFERS_DARK).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PREFERS_DARK);
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => saveThemeMode(themeMode), [themeMode]);

  const darkMode = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const appTheme = useMemo(() => createAppTheme(darkMode), [darkMode]);

  return (
    <ThemeModeContext.Provider value={{ themeMode, setThemeMode }}>
      <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
