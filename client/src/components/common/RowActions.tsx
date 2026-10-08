import { IconButton, Stack, Tooltip } from "@mui/material";
import type { ElementType, MouseEventHandler, ReactNode } from "react";

import { type Intent, INTENT_COLORS } from "./intent.ts";
import { ROW_ACTIONS_SX } from "./rowActionStyles.ts";

interface RowActionProps {
  disabled?: boolean;
  icon: ElementType;
  /** What it does, shown by its color (`intent.ts`): grey, red for what destroys, orange for leaving */
  intent?: Intent;
  /** Its name, which its tooltip shows: "Edit", "Revoke Invite" */
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

interface RowActionsProps {
  /** Its `RowAction`s */
  children: ReactNode;
}

/** One of a row's actions: its icon, named by its label, which its tooltip shows. */
export function RowAction({ icon: Icon, label, intent = "default", onClick, disabled }: RowActionProps) {
  const palette = INTENT_COLORS[intent];
  return (
    <Tooltip title={label}>
      {/* A disabled button takes no pointer: its tooltip shows over the span */}
      <Stack component="span">
        <IconButton
          aria-label={label}
          size="small"
          onClick={onClick}
          disabled={disabled}
          sx={{ color: palette && `${palette}.main` }}
        >
          <Icon fontSize="small" />
        </IconButton>
      </Stack>
    </Tooltip>
  );
}

/**
 * A row's actions, at its end (a table's last column, `align="right"` under its "Actions"): its `RowAction`s, revealed
 * on the row's hover where there is a pointer (the row spreads `ROW_ACTIONS_HOVER_SX`), always shown on a touch screen.
 */
export function RowActions({ children }: RowActionsProps) {
  return (
    <Stack className="row-actions" direction="row" spacing={0.5} sx={ROW_ACTIONS_SX}>
      {children}
    </Stack>
  );
}
