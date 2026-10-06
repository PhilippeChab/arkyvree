import { Card, type CardProps, Stack } from "@mui/material";
import { type ReactNode } from "react";

import { fadeInUpSx, prefersReducedMotion, transitionOf } from "@/client/src/lib/animations.ts";
import { glow } from "@/client/src/theme/shadows.ts";

import { CLICKABLE_SX, clickableProps } from "./clickable.ts";

interface StyledCardProps extends Omit<CardProps, "children"> {
  children: ReactNode;
  isArchived?: boolean;
  isPrivate?: boolean;
  animationIndex?: number;
  animationOffset?: number;
  onClick?: () => void;
}

export function StyledCard({
  children,
  isArchived = false,
  isPrivate = false,
  animationIndex,
  animationOffset,
  onClick,
  sx,
  ...props
}: StyledCardProps) {
  const animationSx = animationIndex != null ? fadeInUpSx(animationIndex, animationOffset) : undefined;
  return (
    <Card
      variant="outlined"
      {...(onClick && clickableProps(onClick))}
      sx={{
        height: "100%",
        borderColor: isArchived ? "warning.light" : "divider",
        borderRadius: 3,
        overflow: "hidden",
        transition: transitionOf(["all"]),
        position: "relative",
        cursor: "default",
        ...(onClick && CLICKABLE_SX),
        bgcolor: "background.paper",
        opacity: isArchived ? 0.9 : 1,
        "&:hover": onClick
          ? {
              borderColor: isArchived ? "warning.main" : "secondary.main",
              boxShadow: (theme) => glow(isArchived ? theme.palette.warning.main : theme.palette.secondary.main),
              transform: "translateY(-4px)",
              opacity: 1,
            }
          : {},
        [prefersReducedMotion]: {
          "&:hover": { transform: "none" },
        },
        "&:before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: (theme) => {
            if (isArchived) {
              return `linear-gradient(90deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`;
            }
            if (isPrivate) {
              return `linear-gradient(90deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`;
            }
            return `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`;
          },
        },
        ...animationSx,
        ...sx,
      }}
      {...props}
    >
      <Stack sx={{ height: "100%" }}>{children}</Stack>
    </Card>
  );
}
