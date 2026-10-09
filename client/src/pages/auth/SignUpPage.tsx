import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AuthPage,
  authPagePath,
  type AuthPageState,
  AuthSubmitButton,
  GoogleSignInSection,
  useAuthRedirect,
} from "@/client/src/components/auth/index.ts";
import { EmailField, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { confirmPasswordRules, EMAIL_RULES, NEW_PASSWORD_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type SignUpFormData = InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"];

export default function SignUpPage() {
  usePageTitle("Sign Up");
  const auth = useAuthRequests();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const redirect = useAuthRedirect();

  const { control, handleSubmit } = useFormWith<SignUpFormData>({
    emailAddress: "",
    password: "",
    passwordConfirmation: "",
  });

  const handleSignUp = (data: SignUpFormData) => {
    setError(null);
    auth.signUp.mutate(data, {
      onSuccess: () => navigate("/verify-email", { state: { redirect } satisfies AuthPageState }),
      onError: (error) => setError(errorMessage(error, "Failed to sign up")),
    });
  };

  return (
    <AuthPage error={error} title="Sign Up">
      <Stack spacing={4}>
        {/* The first field's own top, which adds to the gap above the form */}
        <Stack component="form" onSubmit={handleSubmit(handleSignUp)} noValidate spacing={3} sx={{ pt: 2 }}>
          <EmailField control={control} name="emailAddress" rules={EMAIL_RULES} />

          <PasswordField
            control={control}
            name="password"
            rules={NEW_PASSWORD_RULES}
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
        </Stack>
        <Stack spacing={2}>
          <GoogleSignInSection
            label="Sign Up with Google"
            disabled={auth.pending}
            onError={(error) => setError(errorMessage(error, "Failed to sign up with Google"))}
          />
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2">
              Already have an account?{" "}
              <MuiLink component={Link} to={authPagePath("/sign-in", redirect)} underline="hover">
                Sign in
              </MuiLink>
            </Typography>
          </Box>
        </Stack>
      </Stack>
    </AuthPage>
  );
}
