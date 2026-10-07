import { type ReactNode } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

import { useDirtyForm } from "@/client/src/hooks/index.ts";

import { Modal, type ModalProps } from "./Modal.tsx";
import { valuesEqual } from "./valuesEqual.ts";

export interface FormDialogProps<TFormValues extends FieldValues = FieldValues> extends Omit<
  ModalProps,
  "onClose" | "children"
> {
  children: ReactNode;
  /**
   * The React Hook Form instance bound to the dialog. While the form is
   * dirty, backdrop click and Escape are ignored so users don't lose work.
   * Explicit Cancel / submit / close buttons should still call `onClose`.
   */
  form: UseFormReturn<TFormValues>;
  /** Optional: also block close while a mutation is in flight. */
  isLoading?: boolean;
  onClose: () => void;
}

/**
 * Generic primitive for form-bearing dialogs that don't fit the
 * `CreateDialog`/`EditDialog` shape (custom title bar, multi-step,
 * non-standard action buttons, etc.). Adds dirty-state close-block to
 * `Modal` so users don't lose work via backdrop click / Escape.
 *
 * For standard create/edit flows, use `CreateDialog`/`EditDialog` from
 * `StandardDialogs.tsx` instead.
 */
export function FormDialog<TFormValues extends FieldValues = FieldValues>({
  form,
  onClose,
  isLoading,
  children,
  ...rest
}: FormDialogProps<TFormValues>) {
  // Compute dirtiness by comparing current values to defaults rather
  // than relying on `formState.isDirty`. RHF only flips that flag when
  // callers pass `{ shouldDirty: true }` to setValue, which is easy to
  // forget for custom inputs that write through setValue. Comparing
  // values vs defaults captures every change automatically.
  //
  // For dialogs that prefill on open, use `form.reset(values)` (not
  // setValue) so the new values become the new defaults and the dirty
  // check stays accurate.
  const values = form.watch();
  const defaults = form.formState.defaultValues;
  const isDirty = !valuesEqual(values, defaults);

  // Register with the global dirty-forms tracker so the deploy-update
  // Refresh banner and the native beforeunload prompt warn before
  // discarding unsaved work. Only counts while the dialog is actually
  // open — many parents leave the form mounted and don't call reset()
  // on Cancel, so a dirty-but-hidden form must not gate page reload.
  useDirtyForm(rest.open && isDirty);

  return (
    <Modal
      {...rest}
      onClose={(_, reason) => {
        if (isLoading) return;
        if ((reason === "backdropClick" || reason === "escapeKeyDown") && isDirty) return;
        onClose();
      }}
    >
      {children}
    </Modal>
  );
}
