import { Button, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { AnimatedAlert, DiceSpinner, FormDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  hasPassword: boolean;
}

interface DeleteAccountFormData {
  password: string;
  confirmText: string;
}

export function DeleteAccountDialog({ open, onClose, hasPassword }: DeleteAccountDialogProps) {
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);

  const form = useFormWith<DeleteAccountFormData>({ password: "", confirmText: "" });
  const { control, handleSubmit, watch, reset } = form;
  const password = watch("password");
  const confirmText = watch("confirmText");

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  const deleteMutation = useMutation({
    mutationFn: async (password: string | undefined) => {
      return parseResponse(
        rpc.auth["delete-account"].$post({
          json: { password },
        }),
      );
    },
    // The private route sends the user to sign in
    onSuccess: () => {
      useAuthStore.getState().clearSession({ byUser: true });
      snackbar.success("Account deleted successfully");
    },
    onError: (error) => setError(errorMessage(error, "Failed to delete account")),
  });

  const handleDelete = (data: DeleteAccountFormData) => {
    if (hasPassword && !data.password) return;
    if (!hasPassword && data.confirmText !== "DELETE") return;

    setError(null);
    deleteMutation.mutate(hasPassword ? data.password : undefined);
  };

  const isSubmitDisabled = hasPassword
    ? deleteMutation.isPending || !password
    : deleteMutation.isPending || confirmText !== "DELETE";

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={deleteMutation.isPending} maxWidth="xs">
      <DialogTitle>Delete Account</DialogTitle>
      <form onSubmit={handleSubmit(handleDelete)} noValidate>
        {/* Deeper at the bottom, under the field */}
        <DialogContent sx={{ pb: 3.5 }}>
          <Stack spacing={2}>
            <Typography variant="body2">
              This action is <strong>permanent</strong> and cannot be undone. All your characters, campaign memberships,
              and account data will be removed.
            </Typography>

            <AnimatedAlert in={!!error} severity="error" gutter={2}>
              {error}
            </AnimatedAlert>

            {hasPassword ? (
              <FormTextField
                control={control}
                name="password"
                type="password"
                label="Confirm your password"
                variant="outlined"
                fullWidth
                autoComplete="current-password"
              />
            ) : (
              <FormTextField
                control={control}
                name="confirmText"
                label='Type "DELETE" to confirm'
                variant="outlined"
                fullWidth
                autoComplete="off"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={deleteMutation.isPending} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="error" disabled={isSubmitDisabled}>
            <DiceSpinner size="small" loading={deleteMutation.isPending}>
              Delete Account
            </DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
