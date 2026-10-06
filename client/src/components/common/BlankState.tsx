import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ElementType, ReactNode } from "react";

import { NoMatchesIcon } from "@/client/src/components/icons/index.ts";
import { DURATION, EASING, fadeIn, prefersReducedMotion } from "@/client/src/lib/animations.ts";

interface BlankStateProps {
  /** Icon component, sized and tinted here so every empty state looks alike. */
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  sx?: SxProps<Theme>;
}

interface NoMatchesStateProps {
  search: string;
  sx?: SxProps<Theme>;
}

export function BlankState({ icon: Icon, title, description, action, sx }: BlankStateProps) {
  return (
    <Box
      sx={[
        {
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
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {Icon && (
        <Box sx={{ filter: (theme) => `drop-shadow(0 2px 4px ${alpha(theme.palette.secondary.main, 0.25)})` }}>
          <Icon fontSize="hero" sx={{ color: "text.secondary", mb: 2, opacity: 0.5 }} />
        </Box>
      )}
      <Typography variant="h6" gutterBottom sx={{ color: "text.secondary" }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", mb: action ? 3 : 0, maxWidth: 400, mx: "auto", fontStyle: "italic" }}
      >
        {description}
      </Typography>
      {action}
    </Box>
  );
}

/** A search that found nothing, told apart from a list that has nothing yet. */
export function NoMatchesState({ search, sx }: NoMatchesStateProps) {
  return (
    <BlankState
      icon={NoMatchesIcon}
      title="No matches"
      description={`Nothing matches "${search}". Try another search.`}
      sx={sx}
    />
  );
}
