import { Box, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Controller } from "react-hook-form";

import { VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { AnimatedAlert, DialogFooter, FormDialog, LinkButton } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface EmailChangeVerificationDialogProps {
  onClose: () => void;
  open: boolean;
  pendingEmail: string;
}

interface EmailVerificationFormData {
  digits: string[];
}

export function EmailChangeVerificationDialog({ open, onClose, pendingEmail }: EmailChangeVerificationDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const form = useFormWith<EmailVerificationFormData>({ digits: EMPTY_VERIFICATION_CODE });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.me });
      updateUser({ emailAddress: data.emailAddress, pendingEmailAddress: data.pendingEmailAddress });
      snackbar.success("Email address updated");
      handleClose();
    },
    onError: (error) => setError(errorMessage(error, "Failed to verify the code")),
  });

  const resendMutation = useMutation({
    mutationFn: () => parseResponse(rpc.auth["resend-email-change"].$post()),
    onSuccess: () => {
      setResendSuccess(true);
      setError(null);
    },
    onError: (error) => setError(errorMessage(error, "Failed to resend the code")),
  });

  const handleVerify = (data: EmailVerificationFormData) => {
    setError(null);
    setResendSuccess(false);
    verifyMutation.mutate(data.digits.join(""));
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <FormDialog open={open} onClose={handleClose} form={form} isLoading={verifyMutation.isPending} maxWidth="xs">
      <DialogTitle>Verify New Email</DialogTitle>
      <form onSubmit={form.handleSubmit(handleVerify)} noValidate>
        {/* Deeper at the bottom, under the resend link */}
        <DialogContent sx={{ pb: 3.5 }}>
          <Stack spacing={2}>
            <Typography variant="body2">
              We sent an 8-digit code to <strong>{pendingEmail}</strong>
            </Typography>

            <Box>
              <AnimatedAlert in={!!error} severity="error" gutter={2}>
                {error}
              </AnimatedAlert>

              <AnimatedAlert in={resendSuccess} severity="success" gutter={2}>
                A new code has been sent to your email.
              </AnimatedAlert>

              <Stack spacing={3}>
                <Controller
                  control={form.control}
                  name="digits"
                  render={({ field }) => <VerificationCodeInput digits={field.value} onChange={field.onChange} />}
                />

                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="body2">
                    Didn't receive the code?{" "}
                    <LinkButton onClick={() => resendMutation.mutate()} disabled={resendMutation.isPending}>
                      Resend
                    </LinkButton>
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogFooter
          onCancel={handleClose}
          pending={verifyMutation.isPending}
          action={{ label: "Verify", disabled: !isComplete }}
        />
      </form>
    </FormDialog>
  );
}
