import { useContext } from "react";

import { ThemeContext } from "./themeContext.ts";

/** The app's theme: its mode (light, dark or the system's), whether it's dark, and how to change it. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a CustomThemeProvider");
  }
  return context;
}
