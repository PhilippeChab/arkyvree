/** The app's theme, light and dark: its palette, type, shapes and the shadows it names, and how MUI's components look in it. */

import { alpha, createTheme, Grow, responsiveFontSizes, type Theme } from "@mui/material";

import { PREFERS_REDUCED_MOTION } from "./animations.ts";

declare module "@mui/material/styles" {
  interface Palette {
    /** The auth pages' brand backdrop, its gradient's stops from top to bottom. */
    backdrop: Backdrop;
    /** The brand gold of the logo and the page accents. */
    gold: Gold;
    /** The sidebar's own colors: its expand toggle's, at rest and hovered. */
    sidebar: Sidebar;
  }
  interface PaletteOptions {
    backdrop?: Backdrop;
    gold?: Gold;
    sidebar?: Sidebar;
  }
  interface Theme {
    boxShadows: BoxShadows;
    dropShadows: DropShadows;
    textShadows: TextShadows;
  }
  interface ThemeOptions {
    boxShadows?: BoxShadows;
    dropShadows?: DropShadows;
    textShadows?: TextShadows;
  }
}

/** The auth pages' brand backdrop, its gradient's stops from top to bottom. */
interface Backdrop {
  top: string;
  middle: string;
  bottom: string;
}

/** The shadows the app casts under a box (`boxShadow`), by what casts them. */
interface BoxShadows {
  /** A page's create action, lifted off its header */
  action: string;
  /** An archived card that opens, hovered */
  archivedCardHover: string;
  /** An attachment ringed in the page's color (a portrait in a header) */
  attachmentRing: string;
  /** The demo banner, floating over the page */
  banner: string;
  /** A card that opens, hovered */
  cardHover: string;
  /** The sidebar, over the page */
  drawer: string;
  /** A card's glow in its own color, hovered (the dashboard's stat cards) */
  glow: (color: string) => string;
  /** What the onboarding points at, ringed in gold */
  highlight: string;
  /** The onboarding step's icon disc */
  onboardingIcon: string;
  /** The sidebar's selected item */
  selectedItem: string;
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

/** The shadows an image or an icon casts by its own shape (`filter: drop-shadow(…)`), by what casts them. */
interface DropShadows {
  /** The logo on the auth pages' brand panel */
  authLogo: string;
  /** The logo on the auth pages' phone header */
  authLogoCompact: string;
  /** An empty list's icon */
  blankStateIcon: string;
  /** The logo in the dashboard's hero */
  heroLogo: string;
  /** An onboarding step's icon, on its disc */
  onboardingIcon: string;
  /** The logo on the onboarding's first step */
  onboardingLogo: string;
  /** The arrow of an onboarding popper, toward its target */
  popperArrow: string;
}

/** The brand gold: `main` the theme's own (brighter on the dark theme), `light` and `dark` the two golds, `faint` its glow behind a logo. */
interface Gold {
  main: string;
  light: string;
  dark: string;
  faint: string;
}

/** The sidebar's own colors: its expand toggle's, at rest and hovered. */
interface Sidebar {
  toggle: string;
  toggleHover: string;
}

/** The shadows text casts on the brand's colored panels (`textShadow`), by what casts them. */
interface TextShadows {
  /** The brand's name on the auth pages' panel */
  brand: string;
  /** The brand's name on the auth pages' phone header */
  brandCompact: string;
  /** The dashboard hero's title */
  hero: string;
  /** The dashboard hero's tagline */
  heroTagline: string;
  /** A dashboard stat card's count, label and tagline */
  stat: string;
}

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
  const palette = paletteOf(darkMode);
  const goldHalo = alpha(palette.gold.main, darkMode ? 0.25 : 0.2);
  return responsiveFontSizes(
    createTheme({
      palette,
      boxShadows: {
        action: `0 4px 14px 0 ${palette.primary.main}40`,
        archivedCardHover: `0 8px 24px ${palette.warning.main}20`,
        attachmentRing: "0 6px 24px rgba(0,0,0,0.18)",
        banner: darkMode ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.08)",
        cardHover: `0 4px 16px ${palette.secondary.main}25, 0 8px 32px ${palette.secondary.main}15`,
        drawer: darkMode ? "2px 0 8px rgba(0,0,0,0.3)" : "2px 0 8px rgba(0,0,0,0.08)",
        glow: (color) => `0px 8px 24px ${color}60`,
        highlight: `0 0 0 2px ${palette.gold.main}, 0 0 12px ${goldHalo}`,
        onboardingIcon: `0 4px 20px ${palette.gold.faint}`,
        selectedItem: `0 4px 12px ${palette.primary.main}40`,
      },
      dropShadows: {
        authLogo: `drop-shadow(0 4px 12px ${alpha(palette.gold.dark, darkMode ? 0.4 : 0.3)})`,
        authLogoCompact: `drop-shadow(0 2px 6px ${alpha(palette.gold.dark, 0.3)})`,
        blankStateIcon: `drop-shadow(0 2px 4px ${palette.secondary.main}40)`,
        heroLogo: `drop-shadow(0 4px 12px ${alpha(palette.gold.dark, 0.35)})`,
        onboardingIcon: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
        onboardingLogo: `drop-shadow(0 2px 8px ${alpha(palette.gold.dark, 0.35)})`,
        popperArrow: "drop-shadow(-2px 0 2px rgba(0,0,0,0.1))",
      },
      textShadows: {
        brand: "0 2px 4px rgba(0,0,0,0.4)",
        brandCompact: "0 1px 3px rgba(0,0,0,0.3)",
        hero: "0 2px 8px rgba(0,0,0,0.3)",
        heroTagline: "0 1px 4px rgba(0,0,0,0.2)",
        stat: "0px 2px 4px rgba(0,0,0,0.3)",
      },
      typography: {
        fontFamily: '"Lora Variable", "Georgia", serif',
        h1: {
          fontSize: "2.5rem",
          fontWeight: 600,
          fontFamily: '"Lora Variable", "Georgia", serif',
          letterSpacing: "0.02em",
        },
        h2: {
          fontSize: "2rem",
          fontWeight: 600,
          fontFamily: '"Lora Variable", "Georgia", serif',
          letterSpacing: "0.01em",
        },
        h3: {
          fontSize: "1.75rem",
          fontWeight: 600,
          fontFamily: '"Lora Variable", "Georgia", serif',
        },
        h4: {
          fontSize: "1.5rem",
          fontWeight: 500,
          fontFamily: '"Lora Variable", "Georgia", serif',
        },
        h5: {
          fontSize: "1.25rem",
          fontWeight: 500,
          fontFamily: '"Lora Variable", "Georgia", serif',
        },
        h6: {
          fontSize: "1rem",
          fontWeight: 500,
          fontFamily: '"Lora Variable", "Georgia", serif',
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
                [PREFERS_REDUCED_MOTION]: {
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
              if (color && color !== "primary" && color !== "inherit") return {};

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
        MuiAccordionSummary: {
          styleOverrides: {
            // Its arrow leads its title, as every toggle's does
            root: { flexDirection: "row-reverse", gap: 8 },
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
            root: {
              borderRadius: 4,
              border: darkMode ? "1px solid rgba(210, 180, 140, 0.4)" : "1px solid rgba(141, 30, 30, 0.2)",
            },
          },
        },
        MuiLink: {
          styleOverrides: {
            root: ({ theme }) => ({
              color: theme.palette.primary.main,
              textDecorationColor: "transparent",
              transition: "text-decoration-color 200ms ease",
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
        MuiDialogActions: {
          styleOverrides: {
            root: { padding: "16px 24px" },
          },
        },
        MuiStack: {
          defaultProps: {
            // A Stack spaces its children by a gap, which holds when its row wraps or a child hides
            useFlexGap: true,
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

/** The theme's palette, light or dark: the error page reads the dark one outside the app's theme. */
export function paletteOf(darkMode: boolean) {
  return {
    mode: darkMode ? ("dark" as const) : ("light" as const),
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
    gold: {
      main: darkMode ? "#f5c542" : "#bf9000",
      light: "#f5c542",
      dark: "#bf9000",
      faint: alpha(darkMode ? "#f5c542" : "#bf9000", darkMode ? 0.12 : 0.1),
    },
    sidebar: {
      toggle: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      toggleHover: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    },
    backdrop: darkMode
      ? { top: "#3d2020", middle: "#2a1515", bottom: "#1a0f0f" }
      : { top: "#8d1e1e", middle: "#6b1717", bottom: "#4a1010" },
  };
}
