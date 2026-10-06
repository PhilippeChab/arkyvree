import { Card, type CardProps } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { type ReactNode } from "react";

import { fadeInUpSx, prefersReducedMotion, transitionOf } from "@/client/src/lib/animations.ts";

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
        display: "flex",
        flexDirection: "column",
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
              boxShadow: (theme) =>
                isArchived
                  ? `0 8px 24px ${alpha(theme.palette.warning.main, 0.13)}`
                  : `0 4px 16px ${alpha(theme.palette.secondary.main, 0.15)}, 0 8px 32px ${alpha(theme.palette.secondary.main, 0.08)}`,
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
      {children}
    </Card>
  );
}
