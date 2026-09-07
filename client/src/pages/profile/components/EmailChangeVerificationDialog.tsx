import { AnimatedAlert, FormDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Link as MuiLink,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

interface EmailChangeVerificationDialogProps {
  open: boolean;
  onClose: () => void;
  pendingEmail: string;
}

interface EmailVerificationFormData {
  digits: string[];
}

export function EmailChangeVerificationDialog({
  open,
  onClose,
  pendingEmail,
}: EmailChangeVerificationDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const form = useForm<EmailVerificationFormData>({
    defaultValues: { digits: ["", "", "", "", "", "", "", ""] },
  });
  const { handleSubmit, watch, setValue, reset } = form;
  const digits = watch("digits");

  const resetState = () => {
    reset();
    setError(null);
    setResendSuccess(false);
  };

  useEffect(() => {
    if (!open) resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const setDigits = (newDigits: string[]) => {
    setValue("digits", newDigits, { shouldDirty: true });
  };

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, "").slice(0, 8);
      if (pasted.length > 0) {
        const newDigits = [...digits];
        for (let i = 0; i < pasted.length && i + index < 8; i++) {
          newDigits[i + index] = pasted[i];
        }
        setDigits(newDigits);
        const nextIndex = Math.min(index + pasted.length, 7);
        inputRefs.current[nextIndex]?.focus();
        return;
      }
    }

    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await rpc.auth["verify-email-change"].$post({
        json: { code },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Verification failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      useAuthStore.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              emailAddress: data.emailAddress,
              pendingEmailAddress: data.pendingEmailAddress,
            }
          : null,
      }));
      snackbar.success("Email address updated successfully");
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.auth["resend-email-change"].$post();

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to resend code");
      }

      return response.json();
    },
    onSuccess: () => {
      setResendSuccess(true);
      setError(null);
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const onSubmit = (data: EmailVerificationFormData) => {
    const code = data.digits.join("");
    if (code.length !== 8) return;
    setError(null);
    setResendSuccess(false);
    verifyMutation.mutate(code);
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={verifyMutation.isPending}
      maxWidth="xs"
    >
      <DialogTitle>Verify New Email</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          We sent an 8-digit code to <strong>{pendingEmail}</strong>
        </Typography>

        <AnimatedAlert in={!!error} severity="error" sx={{ mb: 2 }}>
          {error}
        </AnimatedAlert>

        <AnimatedAlert in={resendSuccess} severity="success" sx={{ mb: 2 }}>
          A new code has been sent to your email.
        </AnimatedAlert>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "center",
              mb: 2,
            }}
          >
            {digits.map((digit, index) => (
              <TextField
                key={index}
                inputRef={(el) => {
                  inputRefs.current[index] = el;
                }}
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

          <Box sx={{ textAlign: "center", mb: 1 }}>
            <Typography variant="body2">
              Didn't receive the code?{" "}
              <MuiLink
                component="button"
                type="button"
                underline="hover"
                onClick={() => resendMutation.mutate()}
                disabled={resendMutation.isPending}
              >
                Resend
              </MuiLink>
            </Typography>
          </Box>

          <DialogActions sx={{ px: 0 }}>
            <Button onClick={handleClose} variant="outlined" color="inherit">Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={verifyMutation.isPending || !isComplete}
            >
              {verifyMutation.isPending ? "Verifying..." : "Verify"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </FormDialog>
  );
}
