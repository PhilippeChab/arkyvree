import { Paper, Stack, type StackProps, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  /** The gap between its blocks */
  spacing?: StackProps["spacing"];
  sx?: SxProps<Theme>;
}

/**
 * A page's panel (a sheet's section, a profile's card, an entity's details, a page's error): flat paper in the
 * theme's corner, 16px in on a phone and 32px above. A list's card is a `ListCard`, a banner a `PageHeader`.
 */
export function Panel({ children, spacing, sx }: PanelProps) {
  return (
    <Stack component={Paper} spacing={spacing} sx={[{ p: { xs: 2, sm: 4 } }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Stack>
  );
}
