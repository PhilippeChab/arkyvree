import { Box, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

interface GoldDividerProps {
  label?: string;
  sx?: SxProps<Theme>;
}

function gradientLine(theme: Theme) {
  return `linear-gradient(90deg, transparent, ${theme.palette.secondary.main}, transparent)`;
}

export function GoldDivider({ label, sx }: GoldDividerProps) {
  if (!label) {
    return (
      <Box
        sx={[
          {
            my: 3,
            height: "1px",
            background: gradientLine,
            opacity: 0.4,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      />
    );
  }

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={[
        {
          my: 3,
          alignItems: "center",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
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
    </Stack>
  );
}
