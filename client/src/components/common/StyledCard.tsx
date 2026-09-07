import { Card, type CardProps } from "@mui/material";
import { type ReactNode } from "react";
import { fadeInUpSx, prefersReducedMotion } from "@/client/src/lib/animations.ts";

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
  const animationSx =
    animationIndex != null ? fadeInUpSx(animationIndex, animationOffset) : undefined;
  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: "1px solid",
        borderColor: isArchived ? "warning.light" : "divider",
        borderRadius: 3,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        cursor: onClick ? "pointer" : "default",
        bgcolor: "background.paper",
        opacity: isArchived ? 0.9 : 1,
        "&:hover": onClick
          ? {
              borderColor: isArchived ? "warning.main" : "secondary.main",
              boxShadow: (theme) =>
                isArchived
                  ? `0 8px 24px ${theme.palette.warning.main}20`
                  : `0 4px 16px ${theme.palette.secondary.main}25, 0 8px 32px ${theme.palette.secondary.main}15`,
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
