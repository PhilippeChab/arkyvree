import { AuthPage } from "@/client/src/components/auth/index.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { emailRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Alert,
  Box,
  Button,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

type ForgotPasswordFormData = InferRequestType<
  (typeof rpc.auth)["forgot-password"]["$post"]
>["json"];

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
      setError(error instanceof Error ? error.message : "Failed to send reset code");
    }
  };

  return (
    <AuthPage
      title="Forgot Password"
      subtitle="Enter your email address and we'll send you a code to reset your password."
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          {...register("emailAddress", emailRules)}
          label="Email"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.emailAddress}
          helperText={errors.emailAddress?.message}
          type="email"
          slotProps={{
            htmlInput: { autoComplete: "email" }
          }}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 3, mb: 2 }}
          disabled={isLoading}
        >
          <DiceSpinner size="small" loading={isLoading}>Send Reset Code</DiceSpinner>
        </Button>
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
