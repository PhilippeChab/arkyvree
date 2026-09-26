import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  type DialogProps,
} from "@mui/material";
import { type ReactNode } from "react";
import { type UseFormReturn, type FieldValues } from "react-hook-form";

import { DiceSpinner } from "@/client/src/components/common/DiceSpinner.tsx";
import { FormDialog } from "@/client/src/components/common/FormDialog.tsx";
import { Modal } from "@/client/src/components/common/Modal.tsx";

interface FormActionDialogProps<T extends FieldValues = FieldValues> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void;
  isLoading: boolean;
  children: ReactNode;
  maxWidth?: DialogProps["maxWidth"];
  fixedHeight?: boolean | string;
  submitLabel: string;
}

function FormActionDialog<T extends FieldValues = FieldValues>({
  open,
  onClose,
  title,
  form,
  onSubmit,
  isLoading,
  children,
  maxWidth = "sm",
  fixedHeight = false,
  submitLabel,
}: FormActionDialogProps<T>) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={isLoading}
      maxWidth={maxWidth}
      slotProps={{
        paper: fixedHeight
          ? { sx: { height: { sm: typeof fixedHeight === "string" ? fixedHeight : "80vh" } } }
          : undefined,
      }}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} style={fixedHeight ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={fixedHeight ? { flex: 1, minHeight: 0, overflowY: "auto", scrollbarGutter: "stable" } : undefined}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {children}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            <DiceSpinner size="small" loading={isLoading}>{submitLabel}</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

type StandardFormDialogProps<T extends FieldValues> = Omit<FormActionDialogProps<T>, "submitLabel"> & {
  submitLabel?: string;
};

export function CreateDialog<T extends FieldValues = FieldValues>(props: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Create" {...props} />;
}

export function EditDialog<T extends FieldValues = FieldValues>(props: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Update" {...props} />;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  title: string;
  message: ReactNode;
  /** Extra content below the message, e.g. an option the confirm depends on. */
  children?: ReactNode;
  confirmLabel?: string;
  /** Intent of the confirm button — see docs/ui-buttons.md. */
  confirmColor?: "primary" | "error" | "warning" | "success";
  confirmIcon?: ReactNode;
  maxWidth?: DialogProps["maxWidth"];
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  confirmColor = "primary",
  confirmIcon,
  maxWidth,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()} maxWidth={maxWidth}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" color={confirmColor} disabled={isLoading} startIcon={confirmIcon}>
          <DiceSpinner size="small" loading={isLoading}>{confirmLabel}</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

export function DeleteDialog(props: Omit<ConfirmDialogProps, "confirmColor">) {
  return <ConfirmDialog confirmLabel="Delete" {...props} confirmColor="error" />;
}
