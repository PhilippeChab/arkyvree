import { Box, Button, DialogActions, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

import { DiceSpinner } from "./DiceSpinner.tsx";
import { type Intent, INTENT_COLORS } from "./intent.ts";

/** A dialog's action: its words, and a form's submit unless it has a click of its own. */
interface DialogAction {
  disabled?: boolean;
  icon?: ReactNode;
  /** What it does, its color (`intent.ts`): the theme's gold by default, red for what destroys, orange for leaving. */
  intent?: Intent;
  label: ReactNode;
  onClick?: () => void;
}

interface DialogFooterProps {
  /** The dialog's action, last. */
  action?: DialogAction;
  cancelLabel?: string;
  /**
   * Steps of the dialog's own (a wizard's Back), at the far end before its action. Given, even as nothing, they set the
   * way out apart at the start; the action is always `action`, the one contained button.
   */
  children?: ReactNode;
  /** The way out: Cancel, or Close (`cancelLabel`) when the dialog only shows something. */
  onCancel: () => void;
  /** A request in flight: the way out waits for it, and the action shows it running. */
  pending?: boolean;
  sx?: SxProps<Theme>;
}

/** A dialog's footer: its way out, then its action or its own steps. */
export function DialogFooter({
  onCancel,
  cancelLabel = "Cancel",
  action,
  pending = false,
  children,
  sx,
}: DialogFooterProps) {
  return (
    <DialogActions sx={sx}>
      <Button onClick={onCancel} disabled={pending} variant="outlined" color="inherit">
        {cancelLabel}
      </Button>
      {children !== undefined && <Box sx={{ flexGrow: 1 }} />}
      {children}
      {action && (
        <Button
          type={action.onClick ? "button" : "submit"}
          onClick={action.onClick}
          variant="contained"
          color={INTENT_COLORS[action.intent ?? "default"]}
          disabled={pending || action.disabled}
          startIcon={action.icon}
        >
          <DiceSpinner size="small" loading={pending}>
            {action.label}
          </DiceSpinner>
        </Button>
      )}
    </DialogActions>
  );
}
