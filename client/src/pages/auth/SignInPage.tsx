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
import { emailNotVerified, errorMessage } from "@/client/src/lib/errorMessage.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type SignInFormData = InferRequestType<(typeof rpc.auth)["sign-in"]["$post"]>["json"];

export default function SignInPage() {
  usePageTitle("Sign In");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const redirect = useAuthRedirect();
  const auth = useAuthRequests();

  const { control, handleSubmit } = useFormWith<SignInFormData>({
    emailAddress: "",
    password: "",
  });

  const handleSignIn = (data: SignInFormData) => {
    setError(null);
    auth.signIn.mutate(data, {
      onError: (error) => {
        if (emailNotVerified(error))
          navigate("/verify-email", { state: { from: "sign-in", redirect } satisfies AuthPageState });
        else setError(errorMessage(error, "Failed to sign in"));
      },
    });
  };

  return (
    <AuthPage error={error} title="Sign In">
      <Stack spacing={4}>
        {/* The first field's own top, which adds to the gap above the form */}
        <Stack component="form" onSubmit={handleSubmit(handleSignIn)} noValidate spacing={2} sx={{ pt: 2 }}>
          <Stack spacing={3}>
            <EmailField control={control} name="emailAddress" />

            <PasswordField
              control={control}
              name="password"
              rules={requiredRules("Password is required")}
              label="Password"
              autoComplete="current-password"
            />
          </Stack>

          <Box sx={{ textAlign: "right" }}>
            <MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">
              Forgot password?
            </MuiLink>
          </Box>

          <AuthSubmitButton pending={auth.pending}>Sign In</AuthSubmitButton>
        </Stack>
        <Stack spacing={2}>
          <GoogleSignInSection
            disabled={auth.pending}
            onError={(error) => setError(errorMessage(error, "Failed to sign in with Google"))}
          />
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2">
              Don't have an account?{" "}
              <MuiLink component={Link} to={authPagePath("/sign-up", redirect)} underline="hover">
                Sign up
              </MuiLink>
            </Typography>
          </Box>
        </Stack>
      </Stack>
    </AuthPage>
  );
}
