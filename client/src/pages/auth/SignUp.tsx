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
import { confirmPasswordRules, emailRules, newPasswordRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

type SignUpFormData = InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"];

export default function SignUp() {
  usePageTitle("Sign Up");
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    defaultValues: {
      emailAddress: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const onSubmit = async (data: SignUpFormData) => {
    try {
      setError(null);
      await signUp(data.emailAddress, data.password, data.passwordConfirmation);
      navigate("/verify-email", { state: { redirect } });
    } catch (error) {
      setError(errorMessage(error, "Failed to sign up"));
    }
  };

  return (
    <AuthPage error={error} title="Sign Up">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <EmailField {...register("emailAddress", emailRules)} error={errors.emailAddress} />

        <PasswordField
          {...register("password", newPasswordRules)}
          error={errors.password}
          label="Password"
          autoComplete="new-password"
        />

        <PasswordField
          {...register("passwordConfirmation", confirmPasswordRules<SignUpFormData>("password"))}
          error={errors.passwordConfirmation}
          label="Confirm Password"
          autoComplete="new-password"
        />

        <AuthSubmitButton loading={isLoading}>Sign Up</AuthSubmitButton>
      </form>
      <GoogleSignInSection
        label="Sign up with Google"
        disabled={isLoading}
        onSuccess={() => navigate(redirect ?? "/dashboard")}
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
