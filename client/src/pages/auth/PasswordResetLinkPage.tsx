import { Alert, Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, authPagePath, useAuthRedirect } from "@/client/src/components/auth/index.ts";
import { LoadError, PageLoader, PasswordField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { passwordResetLinkStateQuery } from "@/client/src/lib/queries.ts";
import { confirmPasswordRules, NEW_PASSWORD_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { PASSWORD_RESET_LINK_MESSAGES } from "@/shared/passwordResetLinks.ts";

import { AuthSubmitButton } from "./components/index.ts";
import { useResetToken } from "./useResetToken.ts";

/** The new password, twice, as the reset sends it with the link's token. */
type ResetFormData = Omit<InferRequestType<(typeof rpc.auth)["password-reset-links"]["use"]["$post"]>["json"], "token">;

/**
 * The page an admin's password reset link opens (`/reset-password-link?token=…`): a new password for its account, once,
 * within the hour after the link was made; a link that expired, was used or names none says so up front. A reset signs
 * the account out everywhere, and the page sends its user to sign in.
 */
export default function PasswordResetLinkPage() {
  usePageTitle("Reset Password");
  const auth = useAuthRequests();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const redirect = useAuthRedirect();
  const [error, setError] = useState<string | null>(null);
  const token = useResetToken();
  const { data: link, error: linkError, isPending } = useQuery(passwordResetLinkStateQuery(token));

  const form = useFormWith<ResetFormData>({ newPassword: "", newPasswordConfirmation: "" });

  const backToSignIn = (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="body2">
        <MuiLink component={Link} to={authPagePath("/sign-in", redirect)} underline="hover">
          Back to Sign In
        </MuiLink>
      </Typography>
    </Box>
  );

  const handleReset = (data: ResetFormData) => {
    if (!token) return;
    setError(null);
    auth.resetPasswordWithLink.mutate(
      { ...data, token },
      {
        onSuccess: () => {
          snackbar.success("Password reset: sign in with your new password");
          navigate(authPagePath("/sign-in", redirect));
        },
        onError: (error) => setError(errorMessage(error, "Failed to reset password")),
      },
    );
  };

  if (token && isPending) return <PageLoader />;

  // A link that can't be read, or doesn't reset a password: why, in place of the form
  const refusal = (note: ReactNode) => (
    <AuthPage title="Reset Password">
      <Stack spacing={4} sx={{ pt: 2 }}>
        {note}
        {backToSignIn}
      </Stack>
    </AuthPage>
  );
  if (linkError) return refusal(<LoadError what="Password reset link" error={linkError} />);
  const state = token ? link?.state : "Unknown";
  if (state !== "Valid")
    return refusal(<Alert severity="error">{PASSWORD_RESET_LINK_MESSAGES[state ?? "Unknown"]}</Alert>);

  return (
    <AuthPage
      error={error}
      title="Reset Password"
      subtitle="Choose a new password. It signs you out everywhere you're signed in."
    >
      <Stack spacing={4}>
        {/* The first field's own top, which adds to the gap above the form */}
        <Stack component="form" onSubmit={form.handleSubmit(handleReset)} noValidate spacing={3} sx={{ pt: 2 }}>
          <PasswordField
            control={form.control}
            name="newPassword"
            rules={NEW_PASSWORD_RULES}
            label="New Password"
            autoComplete="new-password"
          />
          <PasswordField
            control={form.control}
            name="newPasswordConfirmation"
            rules={confirmPasswordRules<ResetFormData>("newPassword")}
            label="Confirm New Password"
            autoComplete="new-password"
          />
          <AuthSubmitButton pending={auth.pending}>Reset Password</AuthSubmitButton>
        </Stack>
        {backToSignIn}
      </Stack>
    </AuthPage>
  );
}
