/**
 * The theme the error page renders in, outside the app's providers: the dark theme's colors, on MUI's own components,
 * its title in the app's typeface.
 */

import { createTheme } from "@mui/material";

import { APP_FONT, paletteOf } from "./appTheme.ts";

export const ERROR_THEME = createTheme({
  palette: paletteOf(true),
  typography: { h4: { fontFamily: APP_FONT, fontWeight: 600 } },
});
