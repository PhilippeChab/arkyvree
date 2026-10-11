import { useContext } from "react";

import { ThemeContext } from "./themeContext.ts";

/** The app's theme mode (light, dark or the system's), and how to change it. */
export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useThemeMode must be used within a CustomThemeProvider");

  return context;
}
