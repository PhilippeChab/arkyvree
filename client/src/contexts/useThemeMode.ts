import { useContext } from "react";

import { ThemeModeContext } from "./themeModeContext.ts";

/** The app's theme mode (light, dark or the system's), and how to change it. */
export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (context === undefined) throw new Error("useThemeMode must be used within a ThemeModeProvider");

  return context;
}
