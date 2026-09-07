import { AuthPage, GoogleSignInButton } from "@/client/src/components/auth";
import { useGoogleSignIn, usePageTitle } from "@/client/src/hooks/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Alert,
  Box,
  Button,
  Divider,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type SignUpFormData = InferRequestType<
  (typeof rpc.auth)["sign-up"]["$post"]
>["json"];

export default function SignUp() {
  usePageTitle("Sign Up");
  const { signUp, signInWithGoogle, error: authError, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawRedirect = searchParams.get("redirect");
  const redirect = rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.includes("://") ? rawRedirect : null;

  const handleGoogleToken = useCallback(
    async (idToken: string) => {
      try {
        setError(null);
        await signInWithGoogle(idToken);
        navigate(redirect ?? "/dashboard");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to sign up with Google");
      }
    },
    [signInWithGoogle, navigate, redirect],
  );

  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn(handleGoogleToken);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpFormData>({
    defaultValues: {
      emailAddress: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const password = watch("password");

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
      {(error || authError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || authError}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          {...register("emailAddress", {
            required: "Email is required",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Please enter a valid email address",
            },
          })}
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
          {...register("password", {
            required: "Password is required",
            minLength: {
              value: 12,
              message: "Password must be at least 12 characters",
            },
          })}
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
          {...register("passwordConfirmation", {
            required: "Please confirm your password",
            validate: (value) =>
              value === password || "Passwords do not match",
          })}
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
          {isLoading ? "Signing up..." : "Sign Up"}
        </Button>
      </form>
      {isGoogleAvailable && (
        <>
          <Divider sx={{ my: 2 }}>or</Divider>
          <GoogleSignInButton overlayRef={overlayRef} disabled={isLoading} label="Sign up with Google" />
        </>
      )}
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
