/** The theme the error page renders in, outside the app's providers: the dark theme's colors, on MUI's own components. */

import { createTheme } from "@mui/material";

import { paletteOf } from "./appTheme.ts";

export const ERROR_THEME = createTheme({ palette: paletteOf(true) });
