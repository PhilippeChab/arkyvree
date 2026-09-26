import { VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { AnimatedAlert, DiceSpinner, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

interface EmailChangeVerificationDialogProps {
  open: boolean;
  onClose: () => void;
  pendingEmail: string;
}

interface EmailVerificationFormData {
  digits: string[];
}

export function EmailChangeVerificationDialog({
  open,
  onClose,
  pendingEmail,
}: EmailChangeVerificationDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const form = useForm<EmailVerificationFormData>({
    defaultValues: { digits: EMPTY_VERIFICATION_CODE },
  });
  const digits = form.watch("digits");

  const handleClose = () => {
    form.reset();
    setError(null);
    setResendSuccess(false);
    onClose();
  };

  const verifyMutation = useMutation({
    mutationFn: (code: string) => parseResponse(rpc.auth["verify-email-change"].$post({ json: { code } })),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      updateUser({ emailAddress: data.emailAddress, pendingEmailAddress: data.pendingEmailAddress });
      snackbar.success("Email address updated successfully");
      handleClose();
    },
    onError: (error) => setError(error.message),
  });

  const resendMutation = useMutation({
    mutationFn: () => rpc.auth["resend-email-change"].$post(),
    onSuccess: () => {
      setResendSuccess(true);
      setError(null);
    },
    onError: (error) => setError(error.message),
  });

  const onSubmit = (data: EmailVerificationFormData) => {
    setError(null);
    setResendSuccess(false);
    verifyMutation.mutate(data.digits.join(""));
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={verifyMutation.isPending}
      maxWidth="xs"
    >
      <DialogTitle>Verify New Email</DialogTitle>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            We sent an 8-digit code to <strong>{pendingEmail}</strong>
          </Typography>

          <AnimatedAlert in={!!error} severity="error" sx={{ mb: 2 }}>
            {error}
          </AnimatedAlert>

          <AnimatedAlert in={resendSuccess} severity="success" sx={{ mb: 2 }}>
            A new code has been sent to your email.
          </AnimatedAlert>

          <VerificationCodeInput
            digits={digits}
            onChange={(next) => form.setValue("digits", next, { shouldDirty: true })}
          />

          <Box sx={{ textAlign: "center", mb: 1 }}>
            <Typography variant="body2">
              Didn't receive the code?{" "}
              <MuiLink
                component="button"
                type="button"
                underline="hover"
                onClick={() => resendMutation.mutate()}
                disabled={resendMutation.isPending}
              >
                Resend
              </MuiLink>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={verifyMutation.isPending} variant="outlined" color="inherit">Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={verifyMutation.isPending || !isComplete}
          >
            <DiceSpinner size="small" loading={verifyMutation.isPending}>Verify</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
