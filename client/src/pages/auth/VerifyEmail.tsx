import { AuthPage, VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Alert,
  Box,
  Button,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

interface VerifyEmailFormData {
  digits: string[];
}

export default function VerifyEmail() {
  usePageTitle("Verify Email");
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const pendingVerificationEmail = useAuthStore((s) => s.pendingVerificationEmail);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();
  const fromSignIn = location.state?.from === "sign-in";
  const redirect = safeRedirectPath(location.state?.redirect);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const navigate = useNavigate();

  const form = useForm<VerifyEmailFormData>({ defaultValues: { digits: EMPTY_VERIFICATION_CODE } });
  const digits = form.watch("digits");

  if (!pendingVerificationEmail) {
    return <Navigate to={fromSignIn ? "/sign-in" : "/sign-up"} replace />;
  }

  const onSubmit = async (data: VerifyEmailFormData) => {
    try {
      setError(null);
      await verifyEmail(pendingVerificationEmail, data.digits.join(""));
      navigate(redirect ?? "/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verification failed");
    }
  };

  const handleResend = async () => {
    try {
      setError(null);
      setResendSuccess(false);
      await resendVerification(pendingVerificationEmail);
      setResendSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to resend code");
    }
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <AuthPage
      title="Verify Email"
      subtitle={<>We sent an 8-digit code to <strong>{pendingVerificationEmail}</strong></>}
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

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mb: 2 }}
          disabled={isLoading || !isComplete}
        >
          <DiceSpinner size="small" loading={isLoading}>Verify</DiceSpinner>
        </Button>
      </form>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Don't see it? Check your spam or junk folder.
        </Typography>
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
          <MuiLink component={Link} to={fromSignIn ? "/sign-in" : "/sign-up"} underline="hover">
            {fromSignIn ? "Back to Sign In" : "Back to Sign Up"}
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
