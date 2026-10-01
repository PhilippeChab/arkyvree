import { Box, Link as MuiLink, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, AuthSubmitButton } from "@/client/src/components/auth/index.ts";
import { EmailField } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { emailRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

type ForgotPasswordFormData = InferRequestType<(typeof rpc.auth)["forgot-password"]["$post"]>["json"];

export default function ForgotPassword() {
  usePageTitle("Forgot Password");
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    defaultValues: {
      emailAddress: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      setError(null);
      await forgotPassword(data.emailAddress);
      navigate("/reset-password");
    } catch (error) {
      setError(errorMessage(error, "Failed to send reset code"));
    }
  };

  return (
    <AuthPage
      error={error}
      title="Forgot Password"
      subtitle="Enter your email address and we'll send you a code to reset your password."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <EmailField {...register("emailAddress", emailRules)} error={errors.emailAddress} />

        <AuthSubmitButton loading={isLoading}>Send Reset Code</AuthSubmitButton>
      </form>
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="body2">
          <MuiLink component={Link} to="/sign-in" underline="hover">
            Back to Sign In
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
