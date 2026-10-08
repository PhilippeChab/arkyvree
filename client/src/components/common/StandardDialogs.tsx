import { DialogContent, DialogContentText, type DialogProps, DialogTitle, Stack } from "@mui/material";
import { type ReactNode } from "react";
import { type FieldValues, type UseFormReturn } from "react-hook-form";

import { DialogFooter } from "./DialogFooter.tsx";
import { FormDialog } from "./FormDialog.tsx";
import { type Intent } from "./intent.ts";
import { Modal } from "./Modal.tsx";

type DeleteDialogProps = Omit<ConfirmDialogProps, "intent">;

interface FormActionDialogProps<T extends FieldValues = FieldValues> {
  children: ReactNode;
  fixedHeight?: boolean | string;
  form: UseFormReturn<T>;
  isLoading: boolean;
  maxWidth?: DialogProps["maxWidth"];
  onClose: () => void;
  /** It has faded out: a dialog mounted with its opening is let go (`useDialogState`'s `onExited`). */
  onExited?: () => void;
  onSubmit: (data: T) => void;
  open: boolean;
  submitIcon?: ReactNode;
  submitLabel: string;
  title: ReactNode;
}

type StandardFormDialogProps<T extends FieldValues> = Omit<FormActionDialogProps<T>, "submitLabel"> & {
  submitLabel?: string;
};

export interface ConfirmDialogProps {
  /** Extra content below the message, e.g. an option the confirm depends on. */
  children?: ReactNode;
  confirmIcon?: ReactNode;
  confirmLabel?: string;
  /** What its confirm does, its button's color (`intent.ts`, docs/ui-buttons.md). */
  intent?: Intent;
  isLoading: boolean;
  maxWidth?: DialogProps["maxWidth"];
  message: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
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
  submitIcon,
  onExited,
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
        transition: { onExited },
      }}
    >
      {/* A column only in a dialog of a fixed height, whose content scrolls between the title and the actions */}
      <Stack
        component="form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        sx={[{ display: fixedHeight ? "flex" : "block" }, !!fixedHeight && { flex: 1, minHeight: 0 }]}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={[!!fixedHeight && { flex: 1, minHeight: 0, overflowY: "auto", scrollbarGutter: "stable" }]}>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {children}
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={onClose} pending={isLoading} action={{ label: submitLabel, icon: submitIcon }} />
      </Stack>
    </FormDialog>
  );
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
  intent,
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
      <DialogFooter
        onCancel={onClose}
        pending={isLoading}
        action={{ label: confirmLabel, onClick: onConfirm, intent, icon: confirmIcon }}
      />
    </Modal>
  );
}

export function CreateDialog<T extends FieldValues = FieldValues>({ ...props }: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Create" {...props} />;
}

export function DeleteDialog({ ...props }: DeleteDialogProps) {
  return <ConfirmDialog confirmLabel="Delete" {...props} intent="destructive" />;
}

export function EditDialog<T extends FieldValues = FieldValues>({ ...props }: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Update" {...props} />;
}
