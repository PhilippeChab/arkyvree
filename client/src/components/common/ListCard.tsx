import { Avatar, Box, Card, type CardProps, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { DURATION, EASING, fadeInUpSx, PREFERS_REDUCED_MOTION, transitionOf } from "@/client/src/theme/animations.ts";
import { lineClampSx } from "@/client/src/theme/text.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";
import { NO_DESCRIPTION } from "./EmptyValue.tsx";

interface ListCardGridProps {
  children: ReactNode;
}

interface ListCardProps extends Omit<CardProps, "children" | "title"> {
  /** A control at the end of the title's row, as wide as it needs: a campaign character's card's visibility. */
  action?: ReactNode;
  /** Its place in the list, which staggers its entry (`fadeInUpSx`), from the page that came in (`animationOffset`). */
  animationIndex?: number;
  animationOffset?: number;
  /** Defaults to the title's initial. */
  avatar?: ReactNode;
  avatarSrc?: string;
  /** Brand colour of the avatar's gradient. */
  avatarTone?: "primary" | "secondary";
  /** Its facts, under its title: chips of the family, as its page's header shows them. */
  chips?: ReactNode;
  /** Corner control, e.g. a star toggle. */
  corner?: ReactNode;
  description: string | null | undefined;
  /** Marks the card with the warning stripe and border: a private one says so in its chip */
  isArchived?: boolean;
  /** Opens its record, from a click or the keyboard (`clickableProps`). */
  onClick: () => void;
  title: string;
}

/** Card of the ruleset, character and campaign grids. */
export function ListCard({
  action,
  avatar,
  avatarTone = "primary",
  avatarSrc,
  title,
  corner,
  chips,
  description,
  isArchived = false,
  animationIndex,
  animationOffset,
  onClick,
  sx,
  ...props
}: ListCardProps) {
  return (
    <Card
      elevation={0}
      {...clickableProps(onClick)}
      sx={[
        {
          height: "100%",
          border: 1,
          borderColor: isArchived ? "warning.light" : "divider",
          borderRadius: 3,
          overflow: "hidden",
          transition: transitionOf(["all"], DURATION.moderate, EASING.standard),
          position: "relative",
          bgcolor: "background.paper",
          opacity: isArchived ? 0.9 : 1,
          "&:before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: (theme) =>
              isArchived
                ? `linear-gradient(90deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`
                : `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          },
        },
        CLICKABLE_SX,
        {
          "&:hover": {
            borderColor: isArchived ? "warning.main" : "secondary.main",
            boxShadow: (theme) => (isArchived ? theme.boxShadows.archivedCardHover : theme.boxShadows.cardHover),
            transform: "translateY(-4px)",
            opacity: 1,
          },
          [PREFERS_REDUCED_MOTION]: {
            "&:hover": { transform: "none" },
          },
        },
        animationIndex != null && fadeInUpSx(animationIndex, animationOffset),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {/* The card's content is a column, its description filling what's left */}
      <Stack sx={{ height: "100%" }}>
        {/* The header's inner space, down to the description: deeper under the chips */}
        <Stack
          spacing={1.5}
          sx={{
            p: { xs: 2, sm: 3 },
            pb: chips ? { xs: 3.5, sm: 4 } : { xs: 3, sm: 3.5 },
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
              {avatar ?? title.charAt(0).toUpperCase()}
            </Avatar>
            <Typography
              variant="h6"
              component="h2"
              noWrap
              sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3, flex: 1 }}
            >
              {title}
            </Typography>
            {action}
          </Stack>
          {chips && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              {chips}
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
            {description || NO_DESCRIPTION}
          </Typography>
        </Box>
      </Stack>
    </Card>
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
