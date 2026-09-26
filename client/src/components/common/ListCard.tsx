import { Avatar, Box, Stack, Typography } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";

import { StyledCard } from "./StyledCard.tsx";

interface ListCardProps extends Omit<ComponentProps<typeof StyledCard>, "children" | "title"> {
  avatar: ReactNode;
  /** Brand colour of the avatar's gradient. */
  avatarTone?: "primary" | "secondary";
  avatarSrc?: string;
  title: string;
  /** Corner control, e.g. a star toggle. */
  corner?: ReactNode;
  pills?: ReactNode;
  description: string | null | undefined;
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
      <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 1.5, sm: 2 }, position: "relative" }}>
        {corner && <Box sx={{ position: "absolute", top: 8, right: 8 }}>{corner}</Box>}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, minWidth: 0, pr: corner ? 4 : 0 }}>
          <Avatar
            src={avatarSrc}
            sx={{
              width: 36,
              height: 36,
              border: "2px solid",
              borderColor: "secondary.main",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette[avatarTone].light}, ${theme.palette[avatarTone].main})`,
              fontSize: "1rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {avatar}
          </Avatar>
          <Typography variant="h6" noWrap sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3, flex: 1 }}>
            {title}
          </Typography>
        </Stack>
        {pills && (
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 }}>
            {pills}
          </Stack>
        )}
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
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
export function ListCardGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
        gap: 3,
        mb: 3,
      }}
    >
      {children}
    </Box>
  );
}
