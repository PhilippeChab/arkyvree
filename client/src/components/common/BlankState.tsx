import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { ReactNode } from "react";
import { fadeIn, prefersReducedMotion, DURATION, EASING } from "@/client/src/lib/animations.ts";

interface BlankStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

export function BlankState({ icon, title, description, action, sx }: BlankStateProps) {
  return (
    <Box
      sx={{
        textAlign: "center",
        py: { xs: 4, sm: 8 },
        px: { xs: 2, sm: 4 },
        border: "2px dashed",
        borderColor: "secondary.main",
        borderRadius: 2,
        background: (theme) =>
          `linear-gradient(135deg, ${theme.palette.background.paper}, ${theme.palette.background.default})`,
        animation: `${fadeIn} ${DURATION.slow}ms ${EASING.decelerate} both`,
        [prefersReducedMotion]: { animation: "none" },
        ...sx as Record<string, unknown>,
      }}
    >
      {icon && (
        <Box sx={{ filter: (theme) => `drop-shadow(0 2px 4px ${theme.palette.secondary.main}40)` }}>
          {icon}
        </Box>
      )}
      <Typography variant="h6" gutterBottom sx={{
        color: "text.secondary"
      }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: action ? 3 : 0,
          maxWidth: 400,
          mx: "auto",
          fontStyle: "italic"
        }}>
        {description}
      </Typography>
      {action}
    </Box>
  );
}
