import { Box, Button, DialogActions, DialogContent, DialogTitle, Link as MuiLink, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller } from "react-hook-form";

import { VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { DiceSpinner, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { wrongCredential } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface EmailChangeVerificationDialogProps {
  open: boolean;
  onClose: () => void;
  pendingEmail: string;
}

interface EmailVerificationFormData {
  digits: string[];
}

export function EmailChangeVerificationDialog({ open, onClose, pendingEmail }: EmailChangeVerificationDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const updateUser = useAuthStore((s) => s.updateUser);

  const form = useFormWith<EmailVerificationFormData>({ digits: EMPTY_VERIFICATION_CODE });
  const digits = form.watch("digits");

  const handleClose = () => {
    form.reset();
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
    // A wrong or expired code shows on its field
    onError: (error) => {
      if (wrongCredential(error)) form.setError("digits", { message: error.message });
      else snackbar.error(error, "Failed to verify email");
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => rpc.auth["resend-email-change"].$post(),
    onSuccess: () => {
      form.clearErrors("digits");
      snackbar.success("A new code has been sent to your email.");
    },
    onError: (error) => snackbar.error(error, "Failed to resend code"),
  });

  const onSubmit = (data: EmailVerificationFormData) => {
    verifyMutation.mutate(data.digits.join(""));
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={verifyMutation.isPending} maxWidth="xs">
      <DialogTitle>Verify New Email</DialogTitle>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            We sent an 8-digit code to <strong>{pendingEmail}</strong>
          </Typography>

          <Controller
            control={form.control}
            name="digits"
            render={({ field, fieldState }) => (
              <VerificationCodeInput digits={field.value} onChange={field.onChange} error={fieldState.error?.message} />
            )}
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
          <Button onClick={handleClose} disabled={verifyMutation.isPending} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={verifyMutation.isPending || !isComplete}>
            <DiceSpinner size="small" loading={verifyMutation.isPending}>
              Verify
            </DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}
