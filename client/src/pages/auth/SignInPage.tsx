import { Box, Link as MuiLink, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, AuthSubmitButton, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { EmailField, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle, useSearchParam } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { EMAIL_RULES, requiredRules } from "@/client/src/lib/validation.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type SignInFormData = InferRequestType<(typeof rpc.auth)["sign-in"]["$post"]>["json"];

export default function SignInPage() {
  usePageTitle("Sign In");
  const [error, setError] = useState<string | null>(null);
  const { value: redirectParam } = useSearchParam("redirect");
  const navigate = useNavigate();
  const redirect = safeRedirectPath(redirectParam || null);
  const auth = useAuthRequests();

  const { control, handleSubmit } = useFormWith<SignInFormData>({
    emailAddress: "",
    password: "",
  });

  const handleSignIn = (data: SignInFormData) => {
    setError(null);
    auth.signIn.mutate(data, {
      onError: (error) => {
        if (error instanceof ApiError && error.errorName === "EmailNotVerifiedError")
          navigate("/verify-email", { state: { from: "sign-in", redirect } });
        else setError(errorMessage(error, "Failed to sign in"));
      },
    });
  };

  return (
    <AuthPage error={error} title="Sign In">
      <form onSubmit={handleSubmit(handleSignIn)} noValidate>
        <EmailField control={control} name="emailAddress" rules={EMAIL_RULES} />

        <PasswordField
          control={control}
          name="password"
          rules={requiredRules("Password is required")}
          label="Password"
          autoComplete="current-password"
        />

        <Box sx={{ mt: 1, textAlign: "right" }}>
          <MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">
            Forgot password?
          </MuiLink>
        </Box>

        <AuthSubmitButton loading={auth.pending}>Sign In</AuthSubmitButton>
      </form>
      <GoogleSignInSection
        disabled={auth.pending}
        onError={(error) => setError(errorMessage(error, "Failed to sign in with Google"))}
      />
      <Box sx={{ mt: 2, textAlign: "center" }}>
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
