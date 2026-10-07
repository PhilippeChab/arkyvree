import { Box, Button, type ButtonProps, DialogActions, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

import { DiceSpinner } from "./DiceSpinner.tsx";

/** A dialog's action: its words, and a form's submit unless it has a click of its own. */
interface DialogAction {
  label: ReactNode;
  onClick?: () => void;
  color?: ButtonProps["color"];
  icon?: ReactNode;
  disabled?: boolean;
}

interface DialogFooterProps {
  /** The way out: Cancel, or Close (`cancelLabel`) when the dialog only shows something. */
  onCancel: () => void;
  cancelLabel?: string;
  /** The dialog's action, last. */
  action?: DialogAction;
  /** A request in flight: the way out waits for it, and the action shows it running. */
  pending?: boolean;
  /** Steps of the dialog's own (a wizard's Back and Next), after the way out, at the far end. */
  children?: ReactNode;
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
      {children && <Box sx={{ flexGrow: 1 }} />}
      {children}
      {action && (
        <Button
          type={action.onClick ? "button" : "submit"}
          onClick={action.onClick}
          variant="contained"
          color={action.color}
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
