import { ThemeProvider } from "@mui/material";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { readThemeMode, saveThemeMode } from "@/client/src/stores/themeModeStorage.ts";
import { createAppTheme } from "@/client/src/theme/appTheme.ts";

import { ThemeContext, type ThemeMode } from "./themeContext.ts";

interface CustomThemeProviderProps {
  children: ReactNode;
}

export function CustomThemeProvider({ children }: CustomThemeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);

  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => saveThemeMode(themeMode), [themeMode]);

  const darkMode = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const appTheme = useMemo(() => createAppTheme(darkMode), [darkMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode }}>
      <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
}
