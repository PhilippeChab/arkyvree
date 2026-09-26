import { AuthPage, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
import { confirmPasswordRules, emailRules, newPasswordRules } from "@/client/src/lib/validation.ts";
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
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type SignUpFormData = InferRequestType<
  (typeof rpc.auth)["sign-up"]["$post"]
>["json"];

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
      setError(error instanceof Error ? error.message : "Failed to sign up");
    }
  };

  return (
    <AuthPage title="Sign Up">
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

        <TextField
          {...register("password", newPasswordRules)}
          type="password"
          label="Password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.password}
          helperText={errors.password?.message}
          slotProps={{
            htmlInput: { autoComplete: "new-password" }
          }}
        />

        <TextField
          {...register("passwordConfirmation", confirmPasswordRules<SignUpFormData>("password"))}
          type="password"
          label="Confirm Password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.passwordConfirmation}
          helperText={errors.passwordConfirmation?.message}
          slotProps={{
            htmlInput: { autoComplete: "new-password" }
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
          <DiceSpinner size="small" loading={isLoading}>Sign Up</DiceSpinner>
        </Button>
      </form>
      <GoogleSignInSection
        label="Sign up with Google"
        disabled={isLoading}
        onSuccess={() => navigate(redirect ?? "/dashboard")}
        onError={(error) => setError(error instanceof Error ? error.message : "Failed to sign up with Google")}
      />
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="body2">
          Already have an account?{" "}
          <MuiLink component={Link} to={redirect ? `/sign-in?redirect=${encodeURIComponent(redirect)}` : "/sign-in"} underline="hover">
            Sign in
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
