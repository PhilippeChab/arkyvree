import { AuthPage } from "@/client/src/components/auth";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Alert,
  Box,
  Button,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

interface ResetPasswordFormData {
  digits: string[];
  newPassword: string;
  newPasswordConfirmation: string;
}

export default function ResetPassword() {
  usePageTitle("Reset Password");
  const { resetPassword, forgotPassword, pendingPasswordResetEmail, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  const form = useForm<ResetPasswordFormData>({
    defaultValues: { digits: ["", "", "", "", "", "", "", ""], newPassword: "", newPasswordConfirmation: "" },
  });
  const digits = form.watch("digits");
  const newPassword = form.watch("newPassword");
  const newPasswordConfirmation = form.watch("newPasswordConfirmation");

  if (!pendingPasswordResetEmail) {
    return <Navigate to="/forgot-password" replace />;
  }

  const setDigits = (next: string[]) => form.setValue("digits", next, { shouldDirty: true });

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, 8);
      if (pasted.length > 0) {
        const next = digits.slice();
        for (let i = 0; i < pasted.length && i + index < 8; i++) {
          next[i + index] = pasted[i];
        }
        setDigits(next);
        const nextIndex = Math.min(index + pasted.length, 7);
        inputRefs.current[nextIndex]?.focus();
        return;
      }
    }

    const digit = value.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[index] = digit;
    setDigits(next);

    if (digit && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onSubmit = async (data: ResetPasswordFormData) => {
    const code = data.digits.join("");
    if (code.length !== 8) return;
    if (data.newPassword.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (data.newPassword !== data.newPasswordConfirmation) {
      setError("Passwords do not match");
      return;
    }

    try {
      setError(null);
      await resetPassword(pendingPasswordResetEmail, code, data.newPassword, data.newPasswordConfirmation);
      navigate("/sign-in");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to reset password");
    }
  };

  const handleResend = async () => {
    try {
      setError(null);
      setResendSuccess(false);
      await forgotPassword(pendingPasswordResetEmail);
      setResendSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to resend code");
    }
  };

  const isComplete = digits.every((d) => d !== "") && newPassword.length > 0 && newPasswordConfirmation.length > 0;

  return (
    <AuthPage
      title="Reset Password"
      subtitle={<>We sent an 8-digit code to <strong>{pendingPasswordResetEmail}</strong></>}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {resendSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          A new code has been sent to your email.
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            justifyContent: "center",
            mb: 3,
          }}
        >
          {digits.map((digit, index) => (
            <TextField
              key={index}
              inputRef={(el) => { inputRefs.current[index] = el; }}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              sx={{ width: { xs: 36, sm: 44 } }}
              slotProps={{
                htmlInput: {
                  maxLength: 8,
                  style: {
                    textAlign: "center",
                    fontSize: "1.5rem",
                    fontWeight: "bold",
                    padding: "12px 0",
                  },
                  inputMode: "numeric",
                }
              }}
            />
          ))}
        </Box>

        <TextField
          {...form.register("newPassword")}
          label="New Password"
          type="password"
          variant="outlined"
          fullWidth
          margin="normal"
          slotProps={{
            htmlInput: { minLength: 12 }
          }}
        />

        <TextField
          {...form.register("newPasswordConfirmation")}
          label="Confirm New Password"
          type="password"
          variant="outlined"
          fullWidth
          margin="normal"
          slotProps={{
            htmlInput: { minLength: 12 }
          }}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 2, mb: 2 }}
          disabled={isLoading || !isComplete}
        >
          <DiceSpinner size="small" loading={isLoading}>Reset Password</DiceSpinner>
        </Button>
      </form>
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2">
          Didn't receive the code?{" "}
          <MuiLink
            component="button"
            underline="hover"
            onClick={handleResend}
            disabled={isLoading}
            sx={{ verticalAlign: "baseline", font: "inherit" }}
          >
            Resend
          </MuiLink>
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          <MuiLink component={Link} to="/sign-in" underline="hover">
            Back to Sign In
          </MuiLink>
        </Typography>
      </Box>
    </AuthPage>
  );
}
