/**
 * The page's own styles, under every component's: the root's text rendering (its font and colors are the theme's,
 * through `CssBaseline`), the foot's inset (`safeArea.ts`), the body's frame, thin scrollbars.
 */

import { BOTTOM_INSETS } from "./safeArea.ts";

export const GLOBAL_STYLES = {
  ":root": {
    "--safe-bottom": BOTTOM_INSETS.live,
    lineHeight: 1.5,
    fontWeight: 400,
    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
  // An installed app runs under the gesture bar from its first paint
  "@media (display-mode: standalone)": {
    ":root": { "--safe-bottom": BOTTOM_INSETS.installed },
  },
  body: {
    margin: 0,
    minWidth: 320,
    minHeight: "100vh",
    overflowX: "hidden",
  },
  "*": {
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(155, 155, 155, 0.5) transparent",
  },
  "*::-webkit-scrollbar": {
    width: 8,
    height: 8,
  },
  "*::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "*::-webkit-scrollbar-thumb": {
    backgroundColor: "rgba(155, 155, 155, 0.5)",
    borderRadius: 4,
  },
  "*::-webkit-scrollbar-thumb:hover": {
    backgroundColor: "rgba(155, 155, 155, 0.7)",
  },
} as const;
