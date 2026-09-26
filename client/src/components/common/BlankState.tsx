import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { ElementType, ReactNode } from "react";
import { fadeIn, prefersReducedMotion, DURATION, EASING } from "@/client/src/lib/animations.ts";

interface BlankStateProps {
  /** Icon component, sized and tinted here so every empty state looks alike. */
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

export function BlankState({ icon: Icon, title, description, action, sx }: BlankStateProps) {
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
      {Icon && (
        <Box sx={{ filter: (theme) => `drop-shadow(0 2px 4px ${theme.palette.secondary.main}40)` }}>
          <Icon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2, opacity: 0.5 }} />
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
