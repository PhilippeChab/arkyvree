import { Avatar, Box, Stack, Typography } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";

import { lineClampSx } from "@/client/src/theme/text.ts";
import { getInitial } from "@/shared/text.ts";

import { StyledCard } from "./StyledCard.tsx";

interface ListCardGridProps {
  children: ReactNode;
}

interface ListCardProps extends Omit<ComponentProps<typeof StyledCard>, "children" | "title"> {
  /** Defaults to the title's initial. */
  avatar?: ReactNode;
  avatarSrc?: string;
  /** Brand colour of the avatar's gradient. */
  avatarTone?: "primary" | "secondary";
  /** Corner control, e.g. a star toggle. */
  corner?: ReactNode;
  description: string | null | undefined;
  pills?: ReactNode;
  title: string;
}

/** Card of the ruleset, character and campaign grids. */
export function ListCard({
  avatar,
  avatarTone = "primary",
  avatarSrc,
  title,
  corner,
  pills,
  description,
  ...cardProps
}: ListCardProps) {
  return (
    <StyledCard {...cardProps}>
      {/* The header's inner space, down to the description: deeper under the pills */}
      <Stack
        spacing={1.5}
        sx={{
          p: { xs: 2, sm: 3 },
          pb: pills ? { xs: 3.5, sm: 4 } : { xs: 3, sm: 3.5 },
          position: "relative",
        }}
      >
        {corner && <Box sx={{ position: "absolute", top: 8, right: 8 }}>{corner}</Box>}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, pr: corner ? 4 : 0 }}>
          <Avatar
            src={avatarSrc}
            sx={{
              width: 36,
              height: 36,
              border: 2,
              borderColor: "secondary.main",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette[avatarTone].light}, ${theme.palette[avatarTone].main})`,
              fontSize: "1rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {avatar ?? getInitial(title)}
          </Avatar>
          <Typography
            variant="h6"
            component="h2"
            noWrap
            sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3, flex: 1 }}
          >
            {title}
          </Typography>
        </Stack>
        {pills && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            {pills}
          </Stack>
        )}
      </Stack>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            ...lineClampSx(4),
            color: "text.secondary",
            lineHeight: 1.6,
            minHeight: "6.4em",
          }}
        >
          {description || "No description provided."}
        </Typography>
      </Box>
    </StyledCard>
  );
}

/** Responsive grid the list cards sit in. */
export function ListCardGrid({ children }: ListCardGridProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
        gap: 3,
      }}
    >
      {children}
    </Box>
  );
}
