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
 * (a page's, `ListToolbar`), as a dialog's sit across from its lead (`DialogLead`). On a narrow screen they wrap under it.
 */
export function PanelLead({ children, actions }: PanelLeadProps) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 1 }}>
      <Box sx={{ flex: "1 1 240px" }}>
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
