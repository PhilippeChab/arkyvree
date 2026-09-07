import { AnimatedAlert, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { rpc } from "@/client/src/services/rpc.ts";
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
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) {
      reset();
      setError(null);
    }
  }, [open, reset]);

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  const deleteMutation = useMutation({
    mutationFn: async (password: string | undefined) => {
      const response = await rpc.auth["delete-account"].$post({
        json: { password },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete account");
      }

      return response.json();
    },
    onSuccess: () => {
      useAuthStore.getState().clearSession();
      snackbar.success("Account deleted successfully");
      navigate("/sign-in");
    },
    onError: (error: Error) => {
      setError(error.message);
    },
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
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          This action is <strong>permanent</strong> and cannot be undone. All
          your characters, campaign memberships, and account data will be
          removed.
        </Typography>

        <AnimatedAlert in={!!error} severity="error" sx={{ mb: 2 }}>
          {error}
        </AnimatedAlert>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
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

          <DialogActions sx={{ px: 0 }}>
            <Button onClick={handleClose} variant="outlined" color="inherit">Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              color="error"
              disabled={isSubmitDisabled}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </FormDialog>
  );
}
