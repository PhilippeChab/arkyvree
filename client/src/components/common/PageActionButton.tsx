import { Button, type Theme } from "@mui/material";
import type { ReactNode } from "react";

import { AddButton } from "./AddButton.tsx";
import { DiceSpinner } from "./DiceSpinner.tsx";

interface PageActionButtonProps {
  /** An action other than a create: its icon ("Mark All as Read"'s check). A create takes the add icon. */
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  /** The request it started is running. */
  pending?: boolean;
}

/** The look of a page header's action: large, rounded, lifted off the header. */
const PAGE_ACTION_SX = {
  px: 3,
  py: 1.5,
  borderRadius: 2,
  boxShadow: (theme: Theme) => theme.boxShadows.action,
} as const;

/**
 * A page header's action: a list page's create, in its header and its empty state, or another action given its icon
 * (the notifications' Mark All as Read).
 */
export function PageActionButton({ icon, label, onClick, pending = false }: PageActionButtonProps) {
  if (!icon) return <AddButton size="large" label={label} onClick={onClick} sx={PAGE_ACTION_SX} />;
  return (
    <Button variant="contained" size="large" startIcon={icon} onClick={onClick} disabled={pending} sx={PAGE_ACTION_SX}>
      <DiceSpinner size="small" loading={pending}>
        {label}
      </DiceSpinner>
    </Button>
  );
}
