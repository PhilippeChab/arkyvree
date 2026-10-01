import { AuthPage, AuthSubmitButton, ResendCodeLink, useResendCode, VerificationCodeInput } from "@/client/src/components/auth/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { EMPTY_VERIFICATION_CODE } from "@/client/src/lib/verificationCode.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Box,
  Link as MuiLink,
  Typography,
} from "@mui/material";
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
  const navigate = useNavigate();

  const form = useForm<VerifyEmailFormData>({ defaultValues: { digits: EMPTY_VERIFICATION_CODE } });
  const digits = form.watch("digits");

  const { error, setError, handleResend, notice } = useResendCode(() => resendVerification(pendingVerificationEmail ?? ""));

  if (!pendingVerificationEmail) {
    return <Navigate to={fromSignIn ? "/sign-in" : "/sign-up"} replace />;
  }

  const onSubmit = async (data: VerifyEmailFormData) => {
    try {
      setError(null);
      await verifyEmail(pendingVerificationEmail, data.digits.join(""));
      navigate(redirect ?? "/dashboard");
    } catch (error) {
      setError(errorMessage(error, "Verification failed"));
    }
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <AuthPage
      error={error}
      notice={notice}
      title="Verify Email"
      subtitle={<>We sent an 8-digit code to <strong>{pendingVerificationEmail}</strong></>}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <VerificationCodeInput
          digits={digits}
          onChange={(next) => form.setValue("digits", next, { shouldDirty: true })}
        />

        <AuthSubmitButton loading={isLoading} disabled={!isComplete}>Verify</AuthSubmitButton>
      </form>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
          Don't see it? Check your spam or junk folder.
        </Typography>
        <ResendCodeLink onResend={handleResend} disabled={isLoading} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          <MuiLink component={Link} to={fromSignIn ? "/sign-in" : "/sign-up"} underline="hover">
            {fromSignIn ? "Back to Sign In" : "Back to Sign Up"}
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
