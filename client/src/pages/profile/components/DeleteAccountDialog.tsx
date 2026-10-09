import { DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { DialogFooter, FormDialog, FormTextField, PasswordField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
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

/** What an account without a password types to confirm its deletion. */
const DELETE_CONFIRMATION_TEXT = "DELETE";

/** The confirmation an account without a password types: its rule. */
const DELETE_CONFIRMATION_RULES = {
  validate: (value: string) => value === DELETE_CONFIRMATION_TEXT || `Type "${DELETE_CONFIRMATION_TEXT}" to confirm`,
};

/** Asks for the password (or "DELETE" without one), then deletes the account; mounted while it's open. */
export function DeleteAccountDialog({ open, onClose, onExited, hasPassword }: DeleteAccountDialogProps) {
  const snackbar = useSnackbar();

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
    onError: (error) => snackbar.error(error, "Failed to delete account"),
  });

  // The fields' rules have checked what confirms it
  const handleDelete = (data: DeleteAccountFormData) => deleteMutation.mutate(hasPassword ? data.password : undefined);

  const isConfirmed = hasPassword ? !!password : confirmText === DELETE_CONFIRMATION_TEXT;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      pending={deleteMutation.isPending}
      slotProps={{ transition: { onExited } }}
    >
      <form onSubmit={handleSubmit(handleDelete)} noValidate>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <DialogContentText>
              This action is <strong>permanent</strong> and cannot be undone. Your characters, your campaign memberships
              and your account data are removed. Your rulesets stay, without an owner, for the characters, campaigns and
              contributors that use them.
            </DialogContentText>

            {hasPassword ? (
              <PasswordField
                control={control}
                name="password"
                rules={requiredRules("Password is required")}
                label="Confirm Your Password"
                autoComplete="current-password"
              />
            ) : (
              <FormTextField
                control={control}
                name="confirmText"
                rules={DELETE_CONFIRMATION_RULES}
                label={`Type "${DELETE_CONFIRMATION_TEXT}" to Confirm`}
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
          action={{ label: "Delete Account", intent: "destructive", disabled: !isConfirmed }}
        />
      </form>
    </FormDialog>
  );
}
