import { alpha, Box, Tooltip, Typography } from "@mui/material";
import type { ElementType, ReactNode } from "react";

type PillColor = "default" | "info" | "success" | "warning" | "secondary";

interface InfoPillProps {
  icon: ElementType;
  label: ReactNode;
  color?: PillColor;
  tooltip?: ReactNode;
}

/** Small tinted label with an icon, for status and metadata on cards. */
export function InfoPill({ icon: Icon, label, color = "default", tooltip }: InfoPillProps) {
  const pill = (
    <Box
      sx={(theme) => {
        const main = color === "default" ? theme.palette.grey[600] : theme.palette[color].main;
        return {
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          minWidth: 0,
          bgcolor: alpha(main, theme.palette.mode === "dark" ? 0.25 : 0.1),
          border: "1px solid",
          borderColor: alpha(main, 0.4),
          color: color === "default"
            ? "text.secondary"
            : theme.palette.mode === "dark" ? `${color}.light` : `${color}.dark`,
          "& .MuiSvgIcon-root": { color: main },
        };
      }}
    >
      <Icon sx={{ fontSize: 12, flexShrink: 0 }} />
      <Typography variant="caption" noWrap sx={{ color: "inherit", fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );

  return tooltip ? <Tooltip title={tooltip}>{pill}</Tooltip> : pill;
}
