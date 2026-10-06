import { ThemeProvider } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";

import { useUserPreferencesStore } from "@/client/src/stores/userPreferencesStore.ts";
import { createAppTheme } from "@/client/src/theme/appTheme.ts";

import { ThemeContext } from "./themeContext.ts";

interface CustomThemeProviderProps {
  children: React.ReactNode;
}

export function CustomThemeProvider({ children }: CustomThemeProviderProps) {
  const themeMode = useUserPreferencesStore((state) => state.themeMode);
  const setThemeMode = useUserPreferencesStore((state) => state.setThemeMode);

  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const darkMode = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const appTheme = useMemo(() => createAppTheme(darkMode), [darkMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, darkMode }}>
      <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
}
