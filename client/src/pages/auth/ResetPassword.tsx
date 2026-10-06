import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { Controller } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

import {
  AuthPage,
  AuthSubmitButton,
  ResendCodeLink,
  useResendCode,
  VerificationCodeInput,
} from "@/client/src/components/auth/index.ts";
import { PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { confirmPasswordRules, newPasswordRules } from "@/client/src/lib/validation.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface ResetPasswordFormData {
  digits: string[];
  newPassword: string;
  newPasswordConfirmation: string;
}

export default function ResetPassword() {
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

  if (!pendingPasswordResetEmail) {
    return <Navigate to="/forgot-password" replace />;
  }

  const onSubmit = (data: ResetPasswordFormData) => {
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

  const isComplete = digits.every((d) => d !== "");

  return (
    <AuthPage
      error={error}
      notice={notice}
      title="Reset Password"
      subtitle={
        <>
          We sent an 8-digit code to <strong>{pendingPasswordResetEmail}</strong>
        </>
      }
    >
      <Stack component="form" spacing={3} onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Controller
          control={form.control}
          name="digits"
          render={({ field }) => <VerificationCodeInput digits={field.value} onChange={field.onChange} />}
        />

        <PasswordField
          control={form.control}
          name="newPassword"
          rules={newPasswordRules}
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

        <AuthSubmitButton loading={auth.pending} disabled={!isComplete}>
          Reset Password
        </AuthSubmitButton>
      </Stack>
      <Box sx={{ textAlign: "center" }}>
        <ResendCodeLink onResend={handleResend} disabled={auth.pending} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          <MuiLink component={Link} to="/sign-in" underline="hover">
            Back to Sign In
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
