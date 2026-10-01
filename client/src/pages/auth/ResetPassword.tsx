import { Box, Link as MuiLink, Typography } from "@mui/material";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

import {
  AuthPage,
  AuthSubmitButton,
  ResendCodeLink,
  useResendCode,
  VerificationCodeInput,
} from "@/client/src/components/auth/index.ts";
import { PasswordField } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
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
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const pendingPasswordResetEmail = useAuthStore((s) => s.pendingPasswordResetEmail);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();

  const form = useForm<ResetPasswordFormData>({
    defaultValues: { digits: EMPTY_VERIFICATION_CODE, newPassword: "", newPasswordConfirmation: "" },
  });
  const { errors } = form.formState;
  const digits = form.watch("digits");

  const { error, setError, handleResend, notice } = useResendCode(() =>
    forgotPassword(pendingPasswordResetEmail ?? ""),
  );

  if (!pendingPasswordResetEmail) {
    return <Navigate to="/forgot-password" replace />;
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      setError(null);
      await resetPassword(
        pendingPasswordResetEmail,
        data.digits.join(""),
        data.newPassword,
        data.newPasswordConfirmation,
      );
      navigate("/sign-in");
    } catch (error) {
      setError(errorMessage(error, "Failed to reset password"));
    }
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
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <VerificationCodeInput
          digits={digits}
          onChange={(next) => form.setValue("digits", next, { shouldDirty: true })}
        />

        <PasswordField
          {...form.register("newPassword", newPasswordRules)}
          error={errors.newPassword}
          label="New Password"
          autoComplete="new-password"
        />

        <PasswordField
          {...form.register("newPasswordConfirmation", confirmPasswordRules<ResetPasswordFormData>("newPassword"))}
          error={errors.newPasswordConfirmation}
          label="Confirm New Password"
          autoComplete="new-password"
        />

        <AuthSubmitButton loading={isLoading} disabled={!isComplete}>
          Reset Password
        </AuthSubmitButton>
      </form>
      <Box sx={{ textAlign: "center" }}>
        <ResendCodeLink onResend={handleResend} disabled={isLoading} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          <MuiLink component={Link} to="/sign-in" underline="hover">
            Back to Sign In
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
