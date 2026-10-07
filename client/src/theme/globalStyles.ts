/** The page's own styles, under every component's: the root's type and colors, the body's frame, thin scrollbars. */

export const GLOBAL_STYLES = {
  ":root": {
    fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
    lineHeight: 1.5,
    fontWeight: 400,
    colorScheme: "light dark",
    color: "rgba(255, 255, 255, 0.87)",
    backgroundColor: "#242424",
    fontSynthesis: "none",
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
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
