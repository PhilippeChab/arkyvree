import { Button, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { AnimatedAlert } from "./AnimatedAlert.tsx";
import { DiceSpinner } from "./DiceSpinner.tsx";

interface InlineConfirmProps {
  open: boolean;
  /** What it asks, and what follows: "Revoke this link? Anyone who has it loses access." */
  children: ReactNode;
  /** The way out: "Keep Editing", "Keep Link" */
  cancelLabel: string;
  /** What it does: "Discard", "Revoke" */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Its action is running: its spinner shows, and neither button takes a click. */
  pending?: boolean;
}

/**
 * A dialog asking before it loses something, at its top: a warning bar with its way out, then its action. The dialog
 * that's open asks in place, never a second dialog over it.
 */
export function InlineConfirm({
  open,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  pending = false,
}: InlineConfirmProps) {
  return (
    <AnimatedAlert
      in={open}
      severity="warning"
      action={
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={onCancel} disabled={pending} sx={{ whiteSpace: "nowrap" }}>
            {cancelLabel}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={onConfirm}
            disabled={pending}
            sx={{ whiteSpace: "nowrap" }}
          >
            <DiceSpinner size="small" loading={pending}>
              {confirmLabel}
            </DiceSpinner>
          </Button>
        </Stack>
      }
      gutter={2}
    >
      {children}
    </AnimatedAlert>
  );
}
