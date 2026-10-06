import { Box, type Theme } from "@mui/material";

function gradientLine(theme: Theme) {
  return `linear-gradient(90deg, transparent, ${theme.palette.secondary.main}, transparent)`;
}

/** A thin gold line between a page's blocks, fading out at its ends. */
export function GoldDivider() {
  return <Box sx={{ height: "1px", background: gradientLine, opacity: 0.4 }} />;
}
