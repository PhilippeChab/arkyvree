import { DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { AnimatedAlert, DialogFooter, FormDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface DeleteAccountDialogProps {
  hasPassword: boolean;
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
}

interface DeleteAccountFormData {
  confirmText: string;
  password: string;
}

/** Asks for the password (or "DELETE" without one), then deletes the account; mounted while it's open. */
export function DeleteAccountDialog({ open, onClose, onExited, hasPassword }: DeleteAccountDialogProps) {
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);

  const form = useFormWith<DeleteAccountFormData>({ password: "", confirmText: "" });
  const { control, handleSubmit, watch } = form;
  const password = watch("password");
  const confirmText = watch("confirmText");

  const deleteMutation = useMutation({
    mutationFn: async (password: string | undefined) =>
      parseResponse(
        rpc.auth["delete-account"].$post({
          json: { password },
        }),
      ),
    // The private route sends the user to sign in
    onSuccess: () => {
      useAuthStore.getState().clearSession({ byUser: true });
      snackbar.success("Account deleted");
    },
    onError: (error) => setError(errorMessage(error, "Failed to delete account")),
  });

  const handleDelete = (data: DeleteAccountFormData) => {
    if (hasPassword && !data.password) return;
    if (!hasPassword && data.confirmText !== "DELETE") return;

    setError(null);
    deleteMutation.mutate(hasPassword ? data.password : undefined);
  };

  const isConfirmed = hasPassword ? !!password : confirmText === "DELETE";

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={deleteMutation.isPending}
      slotProps={{ transition: { onExited } }}
    >
      <form onSubmit={handleSubmit(handleDelete)} noValidate>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <DialogContentText>
              This action is <strong>permanent</strong> and cannot be undone. All your characters, campaign memberships,
              and account data will be removed.
            </DialogContentText>

            {/* In a spaced column, which spaces an alert even closed: mounted only while it shows */}
            {error && (
              <AnimatedAlert in severity="error">
                {error}
              </AnimatedAlert>
            )}

            {hasPassword ? (
              <FormTextField
                control={control}
                name="password"
                type="password"
                label="Confirm Your Password"
                variant="outlined"
                fullWidth
                autoComplete="current-password"
              />
            ) : (
              <FormTextField
                control={control}
                name="confirmText"
                label='Type "DELETE" to Confirm'
                variant="outlined"
                fullWidth
                autoComplete="off"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogFooter
          onCancel={onClose}
          pending={deleteMutation.isPending}
          action={{ label: "Delete Account", color: "error", disabled: !isConfirmed }}
        />
      </form>
    </FormDialog>
  );
}
