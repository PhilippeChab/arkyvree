import { AuthPage, VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { confirmPasswordRules, newPasswordRules } from "@/client/src/lib/validation.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Alert,
  Box,
  Button,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

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
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const navigate = useNavigate();

  const form = useForm<ResetPasswordFormData>({
    defaultValues: { digits: EMPTY_VERIFICATION_CODE, newPassword: "", newPasswordConfirmation: "" },
  });
  const { errors } = form.formState;
  const digits = form.watch("digits");

  if (!pendingPasswordResetEmail) {
    return <Navigate to="/forgot-password" replace />;
  }

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      setError(null);
      await resetPassword(pendingPasswordResetEmail, data.digits.join(""), data.newPassword, data.newPasswordConfirmation);
      navigate("/sign-in");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to reset password");
    }
  };

  const handleResend = async () => {
    try {
      setError(null);
      setResendSuccess(false);
      await forgotPassword(pendingPasswordResetEmail);
      setResendSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to resend code");
    }
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <AuthPage
      title="Reset Password"
      subtitle={<>We sent an 8-digit code to <strong>{pendingPasswordResetEmail}</strong></>}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {resendSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          A new code has been sent to your email.
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <VerificationCodeInput
          digits={digits}
          onChange={(next) => form.setValue("digits", next, { shouldDirty: true })}
        />

        <TextField
          {...form.register("newPassword", newPasswordRules)}
          label="New Password"
          type="password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.newPassword}
          helperText={errors.newPassword?.message}
          slotProps={{
            htmlInput: { autoComplete: "new-password" }
          }}
        />

        <TextField
          {...form.register("newPasswordConfirmation", confirmPasswordRules<ResetPasswordFormData>("newPassword"))}
          label="Confirm New Password"
          type="password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.newPasswordConfirmation}
          helperText={errors.newPasswordConfirmation?.message}
          slotProps={{
            htmlInput: { autoComplete: "new-password" }
          }}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 2, mb: 2 }}
          disabled={isLoading || !isComplete}
        >
          <DiceSpinner size="small" loading={isLoading}>Reset Password</DiceSpinner>
        </Button>
      </form>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2">
          Didn't receive the code?{" "}
          <MuiLink
            component="button"
            type="button"
            underline="hover"
            onClick={handleResend}
            disabled={isLoading}
            sx={{ verticalAlign: "baseline", font: "inherit" }}
          >
            Resend
          </MuiLink>
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          <MuiLink component={Link} to="/sign-in" underline="hover">
            Back to Sign In
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
