import { alpha, Stack, type Theme, Tooltip, Typography } from "@mui/material";
import type { ElementType, ReactNode } from "react";

interface InfoPillProps {
  icon: ElementType;
  label: ReactNode;
  color?: PillColor;
  tooltip?: ReactNode;
}

type PillColor = "default" | "info" | "success" | "warning" | "secondary";

/** A pill's color: its palette's main, or a neutral grey. */
function pillColor(theme: Theme, color: PillColor) {
  return color === "default" ? theme.palette.grey[600] : theme.palette[color].main;
}

/** Small tinted label with an icon, for status and metadata on cards. */
export function InfoPill({ icon: Icon, label, color = "default", tooltip }: InfoPillProps) {
  const pill = (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        px: 1,
        py: 0.25,
        borderRadius: 1,
        minWidth: 0,
        bgcolor: (theme) => alpha(pillColor(theme, color), theme.palette.mode === "dark" ? 0.25 : 0.1),
        border: 1,
        borderColor: (theme) => alpha(pillColor(theme, color), 0.4),
        color: (theme) =>
          color === "default" ? "text.secondary" : theme.palette.mode === "dark" ? `${color}.light` : `${color}.dark`,
        "& .MuiSvgIcon-root": { color: (theme) => pillColor(theme, color) },
      }}
    >
      <Icon sx={{ fontSize: 12, flexShrink: 0 }} />
      <Typography variant="caption" noWrap sx={{ color: "inherit", fontWeight: 500 }}>
        {label}
      </Typography>
    </Stack>
  );

  return tooltip ? (
    <Tooltip describeChild title={tooltip}>
      {pill}
    </Tooltip>
  ) : (
    pill
  );
}
