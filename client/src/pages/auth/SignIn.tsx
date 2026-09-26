import { AuthPage, GoogleSignInSection } from "@/client/src/components/auth/index.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { safeRedirectPath } from "@/client/src/lib/safeRedirect.ts";
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
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type SignInFormData = InferRequestType<
  (typeof rpc.auth)["sign-in"]["$post"]
>["json"];

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
          {...register("password", { required: "Password is required" })}
          type="password"
          label="Password"
          variant="outlined"
          fullWidth
          margin="normal"
          error={!!errors.password}
          helperText={errors.password?.message}
          slotProps={{
            htmlInput: { autoComplete: "current-password" }
          }}
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
          <DiceSpinner size="small" loading={isLoading}>Sign In</DiceSpinner>
        </Button>
      </form>
      <GoogleSignInSection
        disabled={isLoading}
        onSuccess={() => navigate(redirect ?? "/dashboard")}
        onError={(error) => setError(error instanceof Error ? error.message : "Failed to sign in with Google")}
      />
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
