import { Link as MuiLink, Stack, Typography } from "@mui/material";
import { Link, Navigate, useLocation } from "react-router-dom";

import {
  AuthPage,
  authPageState,
  CodeSentMessage,
  EMPTY_VERIFICATION_CODE,
  isCodeComplete,
  ResendCodeLink,
  useCodeMessages,
  VerificationCodeField,
  type VerificationCodeFormData,
} from "@/client/src/components/auth/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { AuthSubmitButton } from "./components/index.ts";

export default function VerifyEmailPage() {
  usePageTitle("Verify Email");
  const pendingVerificationEmail = useAuthStore((s) => s.pendingVerificationEmail);
  const location = useLocation();
  const fromSignIn = authPageState(location.state).from === "sign-in";
  const auth = useAuthRequests();

  const form = useFormWith<VerificationCodeFormData>({ digits: EMPTY_VERIFICATION_CODE });
  const digits = form.watch("digits");

  const { error, setError, handleResend, notice } = useCodeMessages((callbacks) =>
    auth.resendVerification.mutate(pendingVerificationEmail ?? "", callbacks),
  );

  if (!pendingVerificationEmail) return <Navigate to={fromSignIn ? "/sign-in" : "/sign-up"} replace />;

  const handleVerify = (data: VerificationCodeFormData) => {
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
          <VerificationCodeField control={form.control} name="digits" />

          <AuthSubmitButton pending={auth.pending} disabled={!isCodeComplete(digits)}>
            Verify
          </AuthSubmitButton>
        </Stack>
        <Stack spacing={1} sx={{ textAlign: "center" }}>
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
