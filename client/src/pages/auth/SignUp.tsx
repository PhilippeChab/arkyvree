import { Box, Link as MuiLink, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthPage, AuthSubmitButton, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { EmailField, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { confirmPasswordRules, emailRules, newPasswordRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type SignUpFormData = InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"];

export default function SignUp() {
  usePageTitle("Sign Up");
  const auth = useAuthRequests();
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  const { control, handleSubmit } = useFormWith<SignUpFormData>({
    emailAddress: "",
    password: "",
    passwordConfirmation: "",
  });

  const onSubmit = (data: SignUpFormData) => {
    setError(null);
    auth.signUp.mutate(data, {
      onSuccess: () => navigate("/verify-email", { state: { redirect } }),
      onError: (error) => setError(errorMessage(error, "Failed to sign up")),
    });
  };

  return (
    <AuthPage error={error} title="Sign Up">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <EmailField control={control} name="emailAddress" rules={emailRules} />

        <PasswordField
          control={control}
          name="password"
          rules={newPasswordRules}
          label="Password"
          autoComplete="new-password"
        />

        <PasswordField
          control={control}
          name="passwordConfirmation"
          rules={confirmPasswordRules<SignUpFormData>("password")}
          label="Confirm Password"
          autoComplete="new-password"
        />

        <AuthSubmitButton loading={auth.pending}>Sign Up</AuthSubmitButton>
      </form>
      <GoogleSignInSection
        label="Sign up with Google"
        disabled={auth.pending}
        onError={(error) => setError(errorMessage(error, "Failed to sign up with Google"))}
      />
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="body2">
          Already have an account?{" "}
          <MuiLink
            component={Link}
            to={redirect ? `/sign-in?redirect=${encodeURIComponent(redirect)}` : "/sign-in"}
            underline="hover"
          >
            Sign in
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
