import { AnimatedAlert, DiceSpinner, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  hasPassword: boolean;
}

interface DeleteAccountFormData {
  password: string;
  confirmText: string;
}

export function DeleteAccountDialog({
  open,
  onClose,
  hasPassword,
}: DeleteAccountDialogProps) {
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<DeleteAccountFormData>({
    defaultValues: { password: "", confirmText: "" },
  });
  const { register, handleSubmit, watch, reset } = form;
  const password = watch("password");
  const confirmText = watch("confirmText");

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  const deleteMutation = useMutation({
    mutationFn: async (password: string | undefined) => {
      return parseResponse(rpc.auth["delete-account"].$post({
        json: { password },
      }));
    },
    onSuccess: () => {
      useAuthStore.getState().clearSession();
      snackbar.success("Account deleted successfully");
      navigate("/sign-in");
    },
    onError: (error) => setError(error.message),
  });

  const onSubmit = (data: DeleteAccountFormData) => {
    if (hasPassword && !data.password) return;
    if (!hasPassword && data.confirmText !== "DELETE") return;

    setError(null);
    deleteMutation.mutate(hasPassword ? data.password : undefined);
  };

  const isSubmitDisabled = hasPassword
    ? deleteMutation.isPending || !password
    : deleteMutation.isPending || confirmText !== "DELETE";

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={deleteMutation.isPending}
      maxWidth="xs"
    >
      <DialogTitle>Delete Account</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This action is <strong>permanent</strong> and cannot be undone. All
            your characters, campaign memberships, and account data will be
            removed.
          </Typography>

          <AnimatedAlert in={!!error} severity="error" sx={{ mb: 2 }}>
            {error}
          </AnimatedAlert>

          {hasPassword ? (
            <TextField
              {...register("password")}
              type="password"
              label="Confirm your password"
              variant="outlined"
              fullWidth
              margin="normal"
              autoComplete="current-password"
            />
          ) : (
            <TextField
              {...register("confirmText")}
              label='Type "DELETE" to confirm'
              variant="outlined"
              fullWidth
              margin="normal"
              autoComplete="off"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={deleteMutation.isPending} variant="outlined" color="inherit">Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={isSubmitDisabled}
          >
            <DiceSpinner size="small" loading={deleteMutation.isPending}>Delete Account</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
