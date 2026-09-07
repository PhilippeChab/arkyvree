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

import { FormDialog } from "@/client/src/components/common/FormDialog.tsx";
import { Modal } from "@/client/src/components/common/Modal.tsx";

interface CreateDialogProps<T extends FieldValues = FieldValues> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void;
  isLoading: boolean;
  children: ReactNode;
  maxWidth?: DialogProps["maxWidth"];
  fixedHeight?: boolean | string;
}

export function CreateDialog<T extends FieldValues = FieldValues>({
  open,
  onClose,
  title,
  form,
  onSubmit,
  isLoading,
  children,
  maxWidth = "sm",
  fixedHeight = false,
}: CreateDialogProps<T>) {
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
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface EditDialogProps<T extends FieldValues = FieldValues> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void;
  isLoading: boolean;
  children: ReactNode;
  maxWidth?: DialogProps["maxWidth"];
  fixedHeight?: boolean | string;
}

export function EditDialog<T extends FieldValues = FieldValues>({
  open,
  onClose,
  title,
  form,
  onSubmit,
  isLoading,
  children,
  maxWidth = "sm",
  fixedHeight = false,
}: EditDialogProps<T>) {
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
            {isLoading ? "Updating..." : "Update"}
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  isLoading: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel = "Confirm",
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={isLoading}>
          {isLoading ? `${confirmLabel}...` : confirmLabel}
        </Button>
      </DialogActions>
    </Modal>
  );
}

interface DeleteDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  onConfirm: () => void;
  isLoading: boolean;
  /** Confirm-button label (default: "Delete"). Loading state appends "...". */
  confirmLabel?: string;
}

export function DeleteDialog({
  open,
  onClose,
  title,
  message,
  onConfirm,
  isLoading,
  confirmLabel = "Delete",
}: DeleteDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={isLoading}>
          {isLoading ? `${confirmLabel}...` : confirmLabel}
        </Button>
      </DialogActions>
    </Modal>
  );
}
