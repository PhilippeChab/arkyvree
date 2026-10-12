import { DialogContentText, Stack } from "@mui/material";
import type { ReactNode } from "react";

interface DialogLeadProps {
  /** Across from it: what the dialog's list takes (Add, Invite, Leave) */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A dialog's lead line, its list's actions across from it: a dialog holds one list, so its actions take no bar of their
 * own (a page's, `ListToolbar`). On a narrow screen they wrap under it.
 */
export function DialogLead({ children, actions }: DialogLeadProps) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 1 }}>
      <DialogContentText sx={{ flex: "1 1 240px" }}>{children}</DialogContentText>
      {actions && (
        <Stack direction="row" spacing={1}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
