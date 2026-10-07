import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, AuthSubmitButton } from "@/client/src/components/auth/index.ts";
import { EmailField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { EMAIL_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type ForgotPasswordFormData = InferRequestType<(typeof rpc.auth)["forgot-password"]["$post"]>["json"];

export default function ForgotPasswordPage() {
  usePageTitle("Forgot Password");
  const auth = useAuthRequests();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { control, handleSubmit } = useFormWith<ForgotPasswordFormData>({
    emailAddress: "",
  });

  const handleSendCode = (data: ForgotPasswordFormData) => {
    setError(null);
    auth.forgotPassword.mutate(data.emailAddress, {
      onSuccess: () => navigate("/reset-password"),
      onError: (error) => setError(errorMessage(error, "Failed to send reset code")),
    });
  };

  return (
    <AuthPage
      error={error}
      title="Forgot Password"
      subtitle="Enter your email address and we'll send you a code to reset your password."
    >
      <Stack spacing={4}>
        {/* The first field's own top, which adds to the gap above the form */}
        <Stack component="form" onSubmit={handleSubmit(handleSendCode)} noValidate spacing={3} sx={{ pt: 2 }}>
          <EmailField control={control} name="emailAddress" rules={EMAIL_RULES} />

          <AuthSubmitButton loading={auth.pending}>Send Reset Code</AuthSubmitButton>
        </Stack>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2">
            <MuiLink component={Link} to="/sign-in" underline="hover">
              Back to Sign In
            </MuiLink>
          </Typography>
        </Box>
      </Stack>
    </AuthPage>
  );
}
