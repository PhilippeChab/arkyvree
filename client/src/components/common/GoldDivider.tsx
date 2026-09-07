import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

interface GoldDividerProps {
  label?: string;
  sx?: SxProps<Theme>;
}

const gradientLine = (theme: Theme) =>
  `linear-gradient(90deg, transparent, ${theme.palette.secondary.main}, transparent)`;

export function GoldDivider({ label, sx }: GoldDividerProps) {
  if (!label) {
    return (
      <Box
        sx={{
          my: 3,
          height: "1px",
          background: gradientLine,
          opacity: 0.4,
          ...sx as Record<string, unknown>,
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        my: 3,
        display: "flex",
        alignItems: "center",
        gap: 2,
        ...sx as Record<string, unknown>,
      }}
    >
      <Box sx={{ flex: 1, height: "1px", background: gradientLine, opacity: 0.4 }} />
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "secondary.main",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", background: gradientLine, opacity: 0.4 }} />
    </Box>
  );
}
