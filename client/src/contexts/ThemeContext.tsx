import { ThemeProvider } from "@mui/material/styles";
import React, { useEffect, useMemo, useState } from "react";

import { createAppTheme } from "@/client/src/theme/appTheme.ts";

import { ThemeContext, type ThemeMode } from "./themeContext.ts";

interface CustomThemeProviderProps {
  children: React.ReactNode;
}

export function CustomThemeProvider({ children }: CustomThemeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem("themeMode");
      if (saved === "light" || saved === "dark" || saved === "system") {
        return saved;
      }
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
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("themeMode", themeMode);
  }, [themeMode]);

  const darkMode = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const appTheme = useMemo(() => createAppTheme(darkMode), [darkMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, darkMode }}>
      <ThemeProvider theme={appTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
}
