import { alpha, createTheme, Grow, responsiveFontSizes, type Theme } from "@mui/material";

import { DURATION, prefersReducedMotion, transitionOf } from "@/client/src/lib/animations.ts";

declare module "@mui/material/SvgIcon" {
  /** The icon sizes beyond MUI's small, medium and large: an unread dot, a chip's, an inline one, a page's hero */
  interface SvgIconPropsSizeOverrides {
    dot: true;
    tiny: true;
    compact: true;
    hero: true;
  }
}

declare module "@mui/material/Chip" {
  /** A count or a tag beside a title, smaller than MUI's small */
  interface ChipPropsSizeOverrides {
    tiny: true;
  }
}

declare module "@mui/material/styles" {
  interface Palette {
    /** The color of the app's own shadows (the sidebar's, a banner's): deeper on the dark theme. */
    shadow: string;
    /** The auth pages' brand backdrop, its gradient's stops from top to bottom. */
    backdrop: { top: string; middle: string; bottom: string };
  }
  interface PaletteOptions {
    shadow?: string;
    backdrop?: { top: string; middle: string; bottom: string };
  }
}

type ContainedColor =
  | "primary"
  | "secondary"
  | "error"
  | "warning"
  | "success"
  | "info"
  | "inherit"
  | string
  | undefined;

function containedBorderColor(color: ContainedColor, darkMode: boolean) {
  switch (color) {
    case "error":
      return darkMode ? "rgba(239, 83, 80, 0.5)" : "rgba(141, 30, 30, 0.4)";
    case "success":
      return darkMode ? "rgba(76, 175, 80, 0.5)" : "rgba(46, 125, 50, 0.4)";
    case "warning":
      return darkMode ? "rgba(255, 152, 0, 0.5)" : "rgba(239, 108, 0, 0.4)";
    default:
      return `rgba(141, 30, 30, ${darkMode ? 0.4 : 0.2})`;
  }
}

function containedGradient(color: ContainedColor, darkMode: boolean) {
  switch (color) {
    case "error":
      return darkMode
        ? {
            background: "linear-gradient(145deg, #ef5350, #c62828)",
            hover: "linear-gradient(145deg, #f44336, #b71c1c)",
          }
        : {
            background: "linear-gradient(145deg, #c62828, #8d1e1e)",
            hover: "linear-gradient(145deg, #d32f2f, #5d1313)",
          };
    case "success":
      return darkMode
        ? {
            background: "linear-gradient(145deg, #4caf50, #2e7d32)",
            hover: "linear-gradient(145deg, #66bb6a, #388e3c)",
          }
        : {
            background: "linear-gradient(145deg, #2e7d32, #1b5e20)",
            hover: "linear-gradient(145deg, #388e3c, #1b5e20)",
          };
    case "warning":
      return darkMode
        ? {
            background: "linear-gradient(145deg, #ff9800, #e65100)",
            hover: "linear-gradient(145deg, #ffa726, #ef6c00)",
          }
        : {
            background: "linear-gradient(145deg, #ef6c00, #b53d00)",
            hover: "linear-gradient(145deg, #f57c00, #c43d00)",
          };
    default:
      return darkMode
        ? {
            background: "linear-gradient(145deg, #f57f17, #bf9000)",
            hover: "linear-gradient(145deg, #ffb300, #f57f17)",
          }
        : {
            background: "linear-gradient(145deg, #bf9000, #8f6800)",
            hover: "linear-gradient(145deg, #f57f17, #bf9000)",
          };
  }
}

/** Ancient Tome Theme - Adapted for both light and dark modes */
export function createAppTheme(darkMode: boolean): Theme {
  return responsiveFontSizes(
    createTheme({
      palette: {
        mode: darkMode ? "dark" : "light",
        primary: {
          main: darkMode ? "#d2b48c" : "#8d1e1e", // Lighter tan for better readability in dark mode
          light: darkMode ? "#deb887" : "#b71c1c",
          dark: darkMode ? "#a0522d" : "#5d1313",
        },
        secondary: {
          main: darkMode ? "#f57f17" : "#bf9000", // Brighter gold for dark mode
          light: darkMode ? "#ffb300" : "#f57f17",
          dark: darkMode ? "#bf9000" : "#8f6800",
        },
        error: {
          main: darkMode ? "#ef5350" : "#c62828",
        },
        warning: {
          main: darkMode ? "#ff9800" : "#ef6c00",
        },
        info: {
          main: darkMode ? "#d2b48c" : "#8d1e1e", // Using lighter primary tan
        },
        success: {
          main: darkMode ? "#4caf50" : "#2e7d32", // Deep forest green
        },
        background: darkMode
          ? {
              default: "#2a251e", // Softer dark parchment - warm dark brown
              paper: "#3d352a", // Warmer aged paper - lighter dark brown
            }
          : {
              default: "#f5f1e8", // Warm parchment
              paper: "#ede7d9", // Darker aged paper
            },
        text: darkMode
          ? {
              primary: "#f4f0e8", // Brighter parchment color for better readability
              secondary: "#e0d4b8", // Lighter warm parchment for secondary text
            }
          : {
              primary: "#3e2723", // Dark brown, like aged ink
              secondary: "#5d4037", // Lighter brown for secondary text
            },
        shadow: darkMode ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.08)",
        backdrop: darkMode
          ? { top: "#3d2020", middle: "#2a1515", bottom: "#1a0f0f" }
          : { top: "#8d1e1e", middle: "#6b1717", bottom: "#4a1010" },
      },
      typography: {
        fontFamily: '"Lora Variable", "Georgia", serif',
        h1: {
          fontSize: "2.5rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
        },
        h2: {
          fontSize: "2rem",
          fontWeight: 600,
          letterSpacing: "0.01em",
        },
        h3: {
          fontSize: "1.75rem",
          fontWeight: 600,
        },
        h4: {
          fontSize: "1.5rem",
          fontWeight: 500,
        },
        h5: {
          fontSize: "1.25rem",
          fontWeight: 500,
        },
        h6: {
          fontSize: "1rem",
          fontWeight: 500,
        },
        subtitle1: {
          fontSize: "1rem",
          fontWeight: 400,
          fontStyle: "italic",
        },
        subtitle2: {
          fontSize: "0.875rem",
          fontWeight: 500,
          fontStyle: "italic",
        },
        body1: {
          fontSize: "1rem",
          lineHeight: 1.6,
        },
        body2: {
          fontSize: "0.875rem",
          lineHeight: 1.5,
        },
        button: {
          textTransform: "none",
          fontWeight: 500,
        },
      },
      shape: {
        borderRadius: 8,
      },
      // MUI's default drops to 48px on landscape phones, but the account button
      // keeps the app bar at 56px there; one height per breakpoint keeps the
      // bars, the drawer spacer and the page offset (AppMain) in step.
      mixins: {
        toolbar: {
          minHeight: 56,
          "@media (min-width:600px)": { minHeight: 64 },
        },
      },
      spacing: 8,
      components: {
        MuiCssBaseline: {
          styleOverrides: (theme: Theme) => {
            const thumb = theme.palette.grey[500];
            return {
              html: { fontSynthesis: "none", textRendering: "optimizeLegibility" },
              body: { minWidth: 320, minHeight: "100vh", overflowX: "hidden" },
              "*": { scrollbarWidth: "thin", scrollbarColor: `${alpha(thumb, 0.5)} transparent` },
              "*::-webkit-scrollbar": { width: 8, height: 8 },
              "*::-webkit-scrollbar-track": { background: "transparent" },
              "*::-webkit-scrollbar-thumb": { backgroundColor: alpha(thumb, 0.5), borderRadius: 4 },
              "*::-webkit-scrollbar-thumb:hover": { backgroundColor: alpha(thumb, 0.7) },
            };
          },
        },
        MuiButton: {
          styleOverrides: {
            root: ({ ownerState }) => {
              const borderColor =
                ownerState.variant === "contained"
                  ? containedBorderColor(ownerState.color, darkMode)
                  : `rgba(141, 30, 30, ${darkMode ? 0.4 : 0.2})`;
              return {
                borderRadius: 4,
                padding: "10px 20px",
                border: `1px solid ${borderColor}`,
                textShadow: "0px 1px 2px rgba(0, 0, 0, 0.1)",
                "&:active": {
                  transform: "scale(0.97)",
                },
                [prefersReducedMotion]: {
                  "&:active": { transform: "none" },
                },
              };
            },
            contained: ({ ownerState }) => {
              const { background, hover } = containedGradient(ownerState.color, darkMode);
              return {
                boxShadow: darkMode
                  ? "inset 0px 1px 0px rgba(255, 255, 255, 0.1), 0px 2px 4px rgba(0, 0, 0, 0.3)"
                  : "inset 0px 1px 0px rgba(255, 255, 255, 0.2), 0px 2px 4px rgba(0, 0, 0, 0.15)",
                background,
                "&:hover": {
                  background: hover,
                  boxShadow: darkMode
                    ? "inset 0px 1px 0px rgba(255, 255, 255, 0.2), 0px 4px 8px rgba(0, 0, 0, 0.4)"
                    : "inset 0px 1px 0px rgba(255, 255, 255, 0.3), 0px 4px 8px rgba(0, 0, 0, 0.2)",
                },
              };
            },
            outlined: ({ ownerState, theme }) => {
              const color = ownerState.color;
              if (color && color !== "primary" && color !== "inherit") {
                return {};
              }
              if (color === "inherit") {
                return {
                  borderColor: theme.palette.text.secondary,
                  color: theme.palette.text.primary,
                  "&:hover": {
                    backgroundColor: darkMode ? "rgba(244, 240, 232, 0.08)" : "rgba(62, 39, 35, 0.04)",
                    borderColor: theme.palette.text.primary,
                  },
                };
              }
              return {
                borderColor: darkMode ? "#d2b48c" : "#8d1e1e",
                color: darkMode ? "#d2b48c" : "#8d1e1e",
                "&:hover": {
                  backgroundColor: darkMode ? "rgba(210, 180, 140, 0.08)" : "rgba(141, 30, 30, 0.04)",
                  borderColor: darkMode ? "#deb887" : "#5d1313",
                },
              };
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              boxShadow: darkMode
                ? "0px 4px 12px rgba(0, 0, 0, 0.25), inset 0px 1px 0px rgba(232, 220, 198, 0.08)"
                : "0px 4px 12px rgba(62, 39, 35, 0.15), inset 0px 1px 0px rgba(255, 255, 255, 0.6)",
              borderRadius: 8,
              border: darkMode ? "1px solid rgba(210, 180, 140, 0.3)" : "1px solid rgba(141, 30, 30, 0.1)",
              background: darkMode
                ? "linear-gradient(145deg, #3d352a, #2a251e)"
                : "linear-gradient(145deg, #ede7d9, #e8dcc6)",
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 8,
                background: darkMode
                  ? "radial-gradient(circle at 20% 80%, rgba(245, 127, 23, 0.02) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(210, 180, 140, 0.02) 0%, transparent 50%)"
                  : "radial-gradient(circle at 20% 80%, rgba(191, 144, 0, 0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(141, 30, 30, 0.03) 0%, transparent 50%)",
                pointerEvents: "none",
              },
              position: "relative",
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              boxShadow: darkMode ? "0px 2px 8px rgba(0, 0, 0, 0.25)" : "0px 2px 8px rgba(62, 39, 35, 0.2)",
              background: darkMode
                ? "linear-gradient(135deg, #a0522d, #8b4513)"
                : "linear-gradient(135deg, #8d1e1e, #5d1313)",
              borderBottom: darkMode ? "2px solid #f57f17" : "2px solid #bf9000",
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: darkMode ? "#3d352a" : "#ede7d9",
              backgroundImage: "none",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              backgroundColor: darkMode ? "#3d352a" : "#ede7d9",
            },
          },
        },
        MuiTableHead: {
          styleOverrides: {
            root: {
              backgroundColor: darkMode ? "rgba(210, 180, 140, 0.15)" : "rgba(141, 30, 30, 0.1)",
              "& .MuiTableCell-head": {
                fontWeight: 600,
                color: darkMode ? "#d2b48c" : "#8d1e1e",
                borderBottom: darkMode ? "2px solid #f57f17" : "2px solid #bf9000",
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: ({ theme }) => ({
              borderRadius: 4,
              border: darkMode ? "1px solid rgba(210, 180, 140, 0.4)" : "1px solid rgba(141, 30, 30, 0.2)",
              variants: [{ props: { size: "tiny" }, style: { height: 20, ...theme.typography.caption } }],
            }),
          },
        },
        MuiCollapse: {
          defaultProps: { timeout: "auto" },
        },
        MuiStack: {
          // `spacing` is a gap, so wrapped children keep it too
          defaultProps: { useFlexGap: true },
        },
        MuiSvgIcon: {
          styleOverrides: {
            root: ({ theme }) => ({
              variants: [
                { props: { fontSize: "dot" }, style: { fontSize: 8 } },
                { props: { fontSize: "tiny" }, style: { fontSize: 14 } },
                { props: { fontSize: "compact" }, style: { fontSize: 18 } },
                {
                  props: { fontSize: "hero" },
                  style: { fontSize: 48, [theme.breakpoints.up("sm")]: { fontSize: 64 } },
                },
              ],
            }),
          },
        },
        MuiLink: {
          styleOverrides: {
            root: ({ theme }) => ({
              color: theme.palette.primary.main,
              textDecorationColor: "transparent",
              transition: transitionOf(["text-decoration-color"], DURATION.fast),
              "&:hover": {
                textDecorationColor: "currentColor",
              },
            }),
          },
        },
        MuiSkeleton: {
          styleOverrides: {
            root: {
              backgroundColor: darkMode ? "rgba(210, 180, 140, 0.08)" : "rgba(191, 144, 0, 0.08)",
              "&::after": {
                background: `linear-gradient(90deg, transparent, ${
                  darkMode ? "rgba(245, 127, 23, 0.08)" : "rgba(191, 144, 0, 0.1)"
                }, transparent)`,
              },
            },
          },
        },
        MuiTooltip: {
          defaultProps: { arrow: true, enterDelay: 300 },
          styleOverrides: {
            tooltip: {
              fontSize: "0.85rem",
              lineHeight: 1.6,
              padding: "8px 12px",
              maxWidth: 320,
            },
          },
        },
        MuiDialogTitle: {
          styleOverrides: {
            root: ({ theme }) => ({
              fontWeight: 600,
              [theme.breakpoints.up("sm")]: { fontSize: "1.25rem" },
            }),
          },
        },
        MuiDialogContent: {
          styleOverrides: {
            // Under a title, room for an outlined field's label, which sits above its box
            root: { ".MuiDialogTitle-root + &": { paddingTop: 8 } },
          },
        },
        MuiDialogContentText: {
          defaultProps: { variant: "body2" },
        },
        MuiDialogActions: {
          styleOverrides: {
            root: { padding: "16px 24px" },
          },
        },
        MuiDialog: {
          defaultProps: {
            transitionDuration: { enter: 250, exit: 150 },

            slots: {
              transition: Grow,
            },
          },
        },
      },
    }),
  );
}
