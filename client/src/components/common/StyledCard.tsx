import { Card, type CardProps, Stack } from "@mui/material";
import { type ReactNode } from "react";

import { DURATION, EASING, fadeInUpSx, PREFERS_REDUCED_MOTION, transitionOf } from "@/client/src/theme/animations.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";

interface StyledCardProps extends Omit<CardProps, "children"> {
  animationIndex?: number;
  animationOffset?: number;
  children: ReactNode;
  /** Marks the card with the warning stripe and border: a private one says so in its chip */
  isArchived?: boolean;
  onClick?: () => void;
}

export function StyledCard({
  children,
  isArchived = false,
  animationIndex,
  animationOffset,
  onClick,
  sx,
  ...props
}: StyledCardProps) {
  return (
    <Card
      elevation={0}
      {...(onClick && clickableProps(onClick))}
      sx={[
        {
          height: "100%",
          border: 1,
          borderColor: isArchived ? "warning.light" : "divider",
          borderRadius: 3,
          overflow: "hidden",
          transition: transitionOf(["all"], DURATION.moderate, EASING.standard),
          position: "relative",
          cursor: "default",
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
        !!onClick && CLICKABLE_SX,
        !!onClick && {
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
      {/* The card's content is a column, its last block filling what's left */}
      <Stack sx={{ height: "100%" }}>{children}</Stack>
    </Card>
  );
}
