import { Box, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { CardTitle } from "./CardTitle.tsx";

interface PanelLeadProps {
  /** Across from it: what the panel's list takes (Add) */
  actions?: ReactNode;
  /** The panel's title */
  children: ReactNode;
}

/**
 * A panel's title, its list's actions across from it: a panel holds one list, so its actions take no bar of their own
 * (a page's, `ListToolbar`), as a dialog's sit across from its lead (`DialogLead`). They share its line, a phone's too,
 * and wrap under it only when a long title leaves them no room.
 */
export function PanelLead({ children, actions }: PanelLeadProps) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 1 }}>
      {/* A title is a label: as wide as its words, so its actions share its line wherever both fit */}
      <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
        <CardTitle>{children}</CardTitle>
      </Box>
      {actions && (
        <Stack direction="row" spacing={1}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
