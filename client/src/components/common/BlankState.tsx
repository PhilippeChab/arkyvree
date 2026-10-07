import { Box, Stack, type SxProps, type Theme, Typography } from "@mui/material";
import type { ElementType, ReactNode } from "react";

import { SearchOffIcon } from "@/client/src/components/icons/index.ts";
import { DURATION, EASING, fadeIn, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface BlankStateProps {
  action?: ReactNode;
  description?: string;
  /** Icon component, sized and tinted here so every empty state looks alike. */
  icon?: ElementType;
  sx?: SxProps<Theme>;
  title: string;
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
          [PREFERS_REDUCED_MOTION]: { animation: "none" },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {Icon && (
        <Box sx={{ filter: (theme) => theme.dropShadows.blankStateIcon }}>
          <Icon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", opacity: 0.5 }} />
        </Box>
      )}
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="p" gutterBottom sx={{ color: "text.secondary" }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 400, mx: "auto", fontStyle: "italic" }}>
            {description}
          </Typography>
        </Box>
        {action && <Box>{action}</Box>}
      </Stack>
    </Stack>
  );
}

/** A search that found nothing, told apart from a list that has nothing yet. */
export function NoMatchesState({ search, sx }: NoMatchesStateProps) {
  return (
    <BlankState
      icon={SearchOffIcon}
      title="No matches"
      description={`Nothing matches "${search}". Try another search.`}
      sx={sx}
    />
  );
}
