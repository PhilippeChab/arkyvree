import { Box, DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  CodeSentMessage,
  EMPTY_VERIFICATION_CODE,
  isCodeComplete,
  ResendCodeLink,
  useResendCode,
  VerificationCodeField,
  type VerificationCodeFormData,
} from "@/client/src/components/auth/index.ts";
import { AnimatedAlert, DialogFooter, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface EmailChangeVerificationDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
  pendingEmail: string;
}

/** Takes the code sent to the new email address; mounted while it's open. */
export function EmailChangeVerificationDialog({
  open,
  onClose,
  onExited,
  pendingEmail,
}: EmailChangeVerificationDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const updateUser = useAuthStore((s) => s.updateUser);

  const form = useFormWith<VerificationCodeFormData>({ digits: EMPTY_VERIFICATION_CODE });
  const digits = form.watch("digits");

  const resendMutation = useMutation({
    mutationFn: () => parseResponse(rpc.auth["resend-email-change"].$post()),
  });
  const { error, setError, handleResend, notice } = useResendCode((callbacks) =>
    resendMutation.mutate(undefined, callbacks),
  );

  const verifyMutation = useMutation({
    mutationFn: (code: string) => parseResponse(rpc.auth["verify-email-change"].$post({ json: { code } })),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.me });
      updateUser({ emailAddress: data.emailAddress, pendingEmailAddress: data.pendingEmailAddress });
      snackbar.success("Email address updated");
      onClose();
    },
    onError: (error) => setError(errorMessage(error, "Failed to verify the code")),
  });

  const handleVerify = (data: VerificationCodeFormData) => {
    setError(null);
    verifyMutation.mutate(data.digits.join(""));
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={verifyMutation.isPending}
      slotProps={{ transition: { onExited } }}
    >
      <form onSubmit={form.handleSubmit(handleVerify)} noValidate>
        <DialogTitle>Verify New Email</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <DialogContentText>
              <CodeSentMessage email={pendingEmail} />
            </DialogContentText>

            <Box>
              <AnimatedAlert in={!!error} severity="error" gutter={2}>
                {error}
              </AnimatedAlert>

              <AnimatedAlert in={!!notice} severity="success" gutter={2}>
                {notice}
              </AnimatedAlert>

              <Stack spacing={3}>
                <VerificationCodeField control={form.control} name="digits" />

                <Box sx={{ textAlign: "center" }}>
                  <ResendCodeLink onResend={handleResend} disabled={resendMutation.isPending} />
                </Box>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogFooter
          onCancel={onClose}
          pending={verifyMutation.isPending}
          action={{ label: "Verify", disabled: !isCodeComplete(digits) }}
        />
      </form>
    </FormDialog>
  );
}
