import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthPage, AuthSubmitButton, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { EmailField, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { emailRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type SignInFormData = InferRequestType<(typeof rpc.auth)["sign-in"]["$post"]>["json"];

export default function SignIn() {
  usePageTitle("Sign In");
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const auth = useAuthRequests();

  const { control, handleSubmit } = useFormWith<SignInFormData>({
    emailAddress: "",
    password: "",
  });

  const onSubmit = (data: SignInFormData) => {
    setError(null);
    auth.signIn.mutate(data, {
      onError: (error) => {
        const message = errorMessage(error, "Failed to sign in");
        if (message === "Email not verified") {
          navigate("/verify-email", { state: { from: "sign-in", redirect } });
        } else {
          setError(message);
        }
      },
    });
  };

  return (
    <AuthPage error={error} title="Sign In">
      <Stack component="form" spacing={3} onSubmit={handleSubmit(onSubmit)} noValidate>
        <EmailField control={control} name="emailAddress" rules={emailRules} />

        <PasswordField
          control={control}
          name="password"
          rules={{ required: "Password is required" }}
          label="Password"
          autoComplete="current-password"
        />

        <Box sx={{ textAlign: "right" }}>
          <MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">
            Forgot password?
          </MuiLink>
        </Box>

        <AuthSubmitButton loading={auth.pending}>Sign In</AuthSubmitButton>
      </Stack>
      <GoogleSignInSection
        disabled={auth.pending}
        onError={(error) => setError(errorMessage(error, "Failed to sign in with Google"))}
      />
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2">
          Don't have an account?{" "}
          <MuiLink
            component={Link}
            to={redirect ? `/sign-up?redirect=${encodeURIComponent(redirect)}` : "/sign-up"}
            underline="hover"
          >
            Sign up
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
