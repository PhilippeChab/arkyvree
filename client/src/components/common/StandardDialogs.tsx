import { DialogContent, DialogContentText, type DialogProps, DialogTitle, Stack } from "@mui/material";
import { type ReactNode } from "react";
import { type FieldValues, type UseFormReturn } from "react-hook-form";

import { DialogFooter } from "./DialogFooter.tsx";
import { FormDialog } from "./FormDialog.tsx";
import { Modal } from "./Modal.tsx";

type DeleteDialogProps = Omit<ConfirmDialogProps, "confirmColor">;

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
  submitIcon?: ReactNode;
}

type StandardFormDialogProps<T extends FieldValues> = Omit<FormActionDialogProps<T>, "submitLabel"> & {
  submitLabel?: string;
};

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
      <DialogFooter
        onCancel={onClose}
        pending={isLoading}
        action={{ label: confirmLabel, onClick: onConfirm, color: confirmColor, icon: confirmIcon }}
      />
    </Modal>
  );
}

export function CreateDialog<T extends FieldValues = FieldValues>({ ...props }: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Create" {...props} />;
}

export function DeleteDialog({ ...props }: DeleteDialogProps) {
  return <ConfirmDialog confirmLabel="Delete" {...props} confirmColor="error" />;
}

export function EditDialog<T extends FieldValues = FieldValues>({ ...props }: StandardFormDialogProps<T>) {
  return <FormActionDialog submitLabel="Update" {...props} />;
}
