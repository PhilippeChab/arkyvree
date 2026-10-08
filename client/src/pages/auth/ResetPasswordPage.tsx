import { Link as MuiLink, Stack, Typography } from "@mui/material";
import { Controller } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

import {
  AuthPage,
  AuthSubmitButton,
  CodeSentMessage,
  EMPTY_VERIFICATION_CODE,
  isCodeComplete,
  ResendCodeLink,
  useResendCode,
  VerificationCodeInput,
} from "@/client/src/components/auth/index.ts";
import { PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { confirmPasswordRules, NEW_PASSWORD_RULES } from "@/client/src/lib/validation.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface ResetPasswordFormData {
  digits: string[];
  newPassword: string;
  newPasswordConfirmation: string;
}

export default function ResetPasswordPage() {
  usePageTitle("Reset Password");
  const pendingPasswordResetEmail = useAuthStore((s) => s.pendingPasswordResetEmail);
  const navigate = useNavigate();
  const auth = useAuthRequests();

  const form = useFormWith<ResetPasswordFormData>({
    digits: EMPTY_VERIFICATION_CODE,
    newPassword: "",
    newPasswordConfirmation: "",
  });
  const digits = form.watch("digits");

  const { error, setError, handleResend, notice } = useResendCode((callbacks) =>
    auth.forgotPassword.mutate(pendingPasswordResetEmail ?? "", callbacks),
  );

  if (!pendingPasswordResetEmail) return <Navigate to="/forgot-password" replace />;

  const handleReset = (data: ResetPasswordFormData) => {
    setError(null);
    auth.resetPassword.mutate(
      {
        emailAddress: pendingPasswordResetEmail,
        code: data.digits.join(""),
        newPassword: data.newPassword,
        newPasswordConfirmation: data.newPasswordConfirmation,
      },
      {
        onSuccess: () => navigate("/sign-in"),
        onError: (error) => setError(errorMessage(error, "Failed to reset password")),
      },
    );
  };

  return (
    <AuthPage
      error={error}
      notice={notice}
      title="Reset Password"
      subtitle={<CodeSentMessage email={pendingPasswordResetEmail} />}
    >
      <Stack spacing={2}>
        <Stack component="form" onSubmit={form.handleSubmit(handleReset)} noValidate spacing={5}>
          <Controller
            control={form.control}
            name="digits"
            render={({ field }) => <VerificationCodeInput digits={field.value} onChange={field.onChange} />}
          />

          <Stack spacing={3}>
            <PasswordField
              control={form.control}
              name="newPassword"
              rules={NEW_PASSWORD_RULES}
              label="New Password"
              autoComplete="new-password"
            />

            <PasswordField
              control={form.control}
              name="newPasswordConfirmation"
              rules={confirmPasswordRules<ResetPasswordFormData>("newPassword")}
              label="Confirm New Password"
              autoComplete="new-password"
            />

            <AuthSubmitButton loading={auth.pending} disabled={!isCodeComplete(digits)}>
              Reset Password
            </AuthSubmitButton>
          </Stack>
        </Stack>
        <Stack spacing={1} sx={{ textAlign: "center" }}>
          <ResendCodeLink onResend={handleResend} disabled={auth.pending} />
          <Typography variant="body2">
            <MuiLink component={Link} to="/sign-in" underline="hover">
              Back to Sign In
            </MuiLink>
          </Typography>
        </Stack>
      </Stack>
    </AuthPage>
  );
}
