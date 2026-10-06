import { alpha, Box, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
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
    <Stack
      spacing={2}
      sx={[
        {
          alignItems: "center",
          textAlign: "center",
          py: { xs: 4, sm: 8 },
          px: { xs: 2, sm: 4 },
          border: 2,
          borderStyle: "dashed",
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
          <Icon fontSize="hero" sx={{ color: "text.secondary", opacity: 0.5 }} />
        </Box>
      )}
      <Box>
        <Typography component="p" variant="h6" gutterBottom sx={{ color: "text.secondary" }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 400, mx: "auto", fontStyle: "italic" }}>
          {description}
        </Typography>
      </Box>
      {action}
    </Stack>
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
