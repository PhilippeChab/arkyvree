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

type SignInFormData = InferRequestType<
  (typeof rpc.auth)["sign-in"]["$post"]
>["json"];

export default function SignIn() {
  usePageTitle("Sign In");
  const { signIn, signInWithGoogle, error: authError, isLoading } = useAuthStore();
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
        setError(error instanceof Error ? error.message : "Failed to sign in with Google");
      }
    },
    [signInWithGoogle, navigate, redirect],
  );

  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn(handleGoogleToken);

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
      const message = error instanceof Error ? error.message : "Failed to sign in";
      if (message === "Email not verified") {
        navigate("/verify-email", { state: { from: "sign-in", redirect } });
      } else {
        setError(message);
      }
    }
  };

  return (
    <AuthPage title="Sign In">
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
              value: 1,
              message: "Password is required",
            },
          })}
          type="password"
          label="Password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.password}
          helperText={errors.password?.message}
        />

        <Box sx={{ mt: 1, textAlign: "right" }}>
          <MuiLink component={Link} to="/forgot-password" underline="hover" variant="body2">
            Forgot password?
          </MuiLink>
        </Box>

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 2, mb: 2 }}
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
      {isGoogleAvailable && (
        <>
          <Divider sx={{ my: 2 }}>or</Divider>
          <GoogleSignInButton overlayRef={overlayRef} disabled={isLoading} />
        </>
      )}
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="body2">
          Don't have an account?{" "}
          <MuiLink component={Link} to={redirect ? `/sign-up?redirect=${encodeURIComponent(redirect)}` : "/sign-up"} underline="hover">
            Sign up
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
