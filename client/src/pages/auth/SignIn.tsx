import { Box, Link as MuiLink, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthPage, AuthSubmitButton, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { EmailField, PasswordField } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { emailRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

type SignInFormData = InferRequestType<(typeof rpc.auth)["sign-in"]["$post"]>["json"];

export default function SignIn() {
  usePageTitle("Sign In");
  const signIn = useAuthStore((s) => s.signIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    defaultValues: {
      emailAddress: "",
      password: "",
    },
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
      setError(null);
      await signIn(data.emailAddress, data.password);
      navigate(redirect ?? "/dashboard");
    } catch (error) {
      const message = errorMessage(error, "Failed to sign in");
      if (message === "Email not verified") {
        navigate("/verify-email", { state: { from: "sign-in", redirect } });
      } else {
        setError(message);
      }
    }
  };

  return (
    <AuthPage error={error} title="Sign In">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <EmailField {...register("emailAddress", emailRules)} error={errors.emailAddress} />

        <PasswordField
          {...register("password", { required: "Password is required" })}
          error={errors.password}
          label="Password"
          autoComplete="current-password"
        />

        <Box sx={{ mt: 1, textAlign: "right" }}>
          <MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">
            Forgot password?
          </MuiLink>
        </Box>

        <AuthSubmitButton loading={isLoading}>Sign In</AuthSubmitButton>
      </form>
      <GoogleSignInSection
        disabled={isLoading}
        onSuccess={() => navigate(redirect ?? "/dashboard")}
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
