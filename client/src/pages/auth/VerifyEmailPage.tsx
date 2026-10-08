import { Link as MuiLink, Stack, Typography } from "@mui/material";
import { Controller } from "react-hook-form";
import { Link, Navigate, useLocation } from "react-router-dom";

import {
  AuthPage,
  authPageState,
  AuthSubmitButton,
  CodeSentMessage,
  EMPTY_VERIFICATION_CODE,
  isCodeComplete,
  ResendCodeLink,
  useResendCode,
  VerificationCodeInput,
} from "@/client/src/components/auth/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

interface VerifyEmailFormData {
  digits: string[];
}

export default function VerifyEmailPage() {
  usePageTitle("Verify Email");
  const pendingVerificationEmail = useAuthStore((s) => s.pendingVerificationEmail);
  const location = useLocation();
  const fromSignIn = authPageState(location.state).from === "sign-in";
  const auth = useAuthRequests();

  const form = useFormWith<VerifyEmailFormData>({ digits: EMPTY_VERIFICATION_CODE });
  const digits = form.watch("digits");

  const { error, setError, handleResend, notice } = useResendCode((callbacks) =>
    auth.resendVerification.mutate(pendingVerificationEmail ?? "", callbacks),
  );

  if (!pendingVerificationEmail) return <Navigate to={fromSignIn ? "/sign-in" : "/sign-up"} replace />;

  const handleVerify = (data: VerifyEmailFormData) => {
    setError(null);
    auth.verifyEmail.mutate(
      { emailAddress: pendingVerificationEmail, code: data.digits.join("") },
      { onError: (error) => setError(errorMessage(error, "Failed to verify the code")) },
    );
  };

  return (
    <AuthPage
      error={error}
      notice={notice}
      title="Verify Email"
      subtitle={<CodeSentMessage email={pendingVerificationEmail} />}
    >
      <Stack spacing={2}>
        <Stack component="form" onSubmit={form.handleSubmit(handleVerify)} noValidate spacing={5}>
          <Controller
            control={form.control}
            name="digits"
            render={({ field }) => <VerificationCodeInput digits={field.value} onChange={field.onChange} />}
          />

          <AuthSubmitButton loading={auth.pending} disabled={!isCodeComplete(digits)}>
            Verify
          </AuthSubmitButton>
        </Stack>
        <Stack spacing={1} sx={{ textAlign: "center" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Don't see it? Check your spam or junk folder.
          </Typography>
          <ResendCodeLink onResend={handleResend} disabled={auth.pending} />
          <Typography variant="body2">
            <MuiLink component={Link} to={fromSignIn ? "/sign-in" : "/sign-up"} underline="hover">
              {fromSignIn ? "Back to Sign In" : "Back to Sign Up"}
            </MuiLink>
          </Typography>
        </Stack>
      </Stack>
    </AuthPage>
  );
}
