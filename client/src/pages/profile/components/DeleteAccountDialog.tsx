import { Button, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { DiceSpinner, FormDialog, FormTextField, PasswordField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { wrongCredential } from "@/client/src/lib/errorMessage.ts";
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

  const form = useFormWith<DeleteAccountFormData>({ password: "", confirmText: "" });
  const { control, handleSubmit, watch, reset } = form;
  const password = watch("password");
  const confirmText = watch("confirmText");

  const handleClose = () => {
    reset();
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
      snackbar.success("Account deleted");
    },
    // A wrong password shows on its field
    onError: (error) => {
      if (wrongCredential(error)) form.setError("password", { message: error.message });
      else snackbar.error(error, "Failed to delete account");
    },
  });

  const onSubmit = (data: DeleteAccountFormData) => {
    if (hasPassword && !data.password) return;
    if (!hasPassword && data.confirmText !== "DELETE") return;

    deleteMutation.mutate(hasPassword ? data.password : undefined);
  };

  const isSubmitDisabled = hasPassword
    ? deleteMutation.isPending || !password
    : deleteMutation.isPending || confirmText !== "DELETE";

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={deleteMutation.isPending} maxWidth="xs">
      <Stack component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <DialogContentText>
              This action is <strong>permanent</strong> and cannot be undone. All your characters, campaign memberships,
              and account data will be removed.
            </DialogContentText>

            {hasPassword ? (
              <PasswordField
                control={control}
                name="password"
                label="Confirm Your Password"
                autoComplete="current-password"
              />
            ) : (
              <FormTextField control={control} name="confirmText" label='Type "DELETE" to Confirm' autoComplete="off" />
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
      </Stack>
    </FormDialog>
  );
}
