import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { GoogleSignInButton } from "@/client/src/components/auth/index.ts";
import {
  AttachmentField,
  DiceSpinner,
  EmailField,
  FormActions,
  FormTextField,
  PageBody,
  PageError,
  PageHeader,
  PasswordField,
  Section,
  TagChip,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useFormWith, useGoogleSignIn, usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage, wrongCredential } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { confirmPasswordRules, emailRules, newPasswordRules, usernameRules } from "@/client/src/lib/validation.ts";
import { DeleteAccountDialog, EmailChangeVerificationDialog } from "@/client/src/pages/profile/components/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { AuthUser } from "@/client/src/stores/authUser.ts";

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

interface ProfileFormData {
  username: string;
  emailAddress: string;
}

function toProfileForm(user: Pick<AuthUser, "username" | "emailAddress">): ProfileFormData {
  return {
    username: user.username ?? "",
    emailAddress: user.emailAddress,
  };
}

export default function ProfilePage() {
  usePageTitle("Profile");
  const updateUser = useAuthStore((s) => s.updateUser);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const {
    data: userData,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => parseResponse(rpc.auth.me.$get()),
  });

  const hasPassword = userData?.hasPassword ?? true;

  const { data: linkedAccounts } = useQuery({
    queryKey: queryKeys.auth.linkedAccounts,
    queryFn: () => parseResponse(rpc.auth["linked-accounts"].$get()),
  });

  const isGoogleLinked = linkedAccounts?.some((a) => a.provider === "google") ?? false;

  const linkGoogle = useMutation({
    mutationFn: (idToken: string) => rpc.auth["link-google"].$post({ json: { idToken } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
      snackbar.success("Google account linked");
    },
    onError: (error) => snackbar.error(error, "Failed to link Google account"),
  });
  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn((idToken) => linkGoogle.mutate(idToken));

  const unlinkOauthMutation = useMutation({
    mutationFn: (provider: string) => rpc.auth["unlink-oauth"].$post({ json: { provider } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
      snackbar.success("Account unlinked");
    },
    onError: (error) => snackbar.error(error, "Failed to unlink account"),
  });

  const profileForm = useFormWith<ProfileFormData>({ username: "", emailAddress: "" });
  const profileSync = useFormSync(profileForm, userData && toProfileForm(userData));

  // Set-password (no password yet, e.g. Google-only accounts) uses the same
  // form minus the current password.
  const passwordForm = useFormWith<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    newPasswordConfirmation: "",
  });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileFormData) =>
      parseResponse(
        rpc.auth.profile.$put({
          json: {
            username: data.username || undefined,
            emailAddress: data.emailAddress || undefined,
          },
        }),
      ),
    onSuccess: (data) => {
      // The server's values, not the submitted ones: a new email stays pending
      // until verified, so the field keeps the current address.
      profileSync.saved(toProfileForm(data));
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      updateUser({
        emailAddress: data.emailAddress,
        username: data.username,
        pendingEmailAddress: data.pendingEmailAddress,
      });

      if (data.pendingEmailAddress) {
        setVerifyDialogOpen(true);
        snackbar.success("Verification code sent to your new email");
      } else {
        snackbar.success("Profile updated");
      }
    },
    onError: (error) => snackbar.error(error, "Failed to update profile"),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordFormData) =>
      hasPassword
        ? rpc.auth.password.$put({ json: data })
        : rpc.auth["set-password"].$post({
            json: { newPassword: data.newPassword, newPasswordConfirmation: data.newPasswordConfirmation },
          }),
    onSuccess: () => {
      passwordForm.reset();
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      snackbar.success(hasPassword ? "Password updated" : "Password set");
    },
    // A wrong current password shows on its field
    onError: (error) => {
      if (wrongCredential(error)) passwordForm.setError("currentPassword", { message: error.message });
      else snackbar.error(error, hasPassword ? "Failed to update password" : "Failed to set password");
    },
  });

  const cancelEmailChangeMutation = useMutation({
    mutationFn: () => rpc.auth["cancel-email-change"].$post(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      updateUser({ pendingEmailAddress: null });
      snackbar.success("Email change cancelled");
    },
    onError: (error) => snackbar.error(error, "Failed to cancel email change"),
  });

  if (isLoading) {
    return (
      <PageBody width="lg">
        <DiceSpinner sx={{ minHeight: 400 }} />
      </PageBody>
    );
  }

  // A failed background refetch keeps the loaded profile (and any edits in progress) on screen.
  if (!userData) {
    return (
      <PageBody width="lg">
        <PageError message={loadFailureMessage("Profile", error)} />
      </PageBody>
    );
  }

  const profileErrors = profileForm.formState.errors;

  return (
    <PageBody width="lg">
      <PageHeader title="Profile" subtitle="Manage your account information and security settings" />

      {userData?.pendingEmailAddress && (
        <Alert
          severity="info"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" onClick={() => setVerifyDialogOpen(true)}>
                Verify
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => cancelEmailChangeMutation.mutate()}
                disabled={cancelEmailChangeMutation.isPending}
              >
                <DiceSpinner size="small" loading={cancelEmailChangeMutation.isPending}>
                  Cancel
                </DiceSpinner>
              </Button>
            </Stack>
          }
        >
          Pending email change to <strong>{userData.pendingEmailAddress}</strong>
        </Alert>
      )}

      <Section title="Basic Information">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 4 }}
          sx={{ alignItems: { xs: "center", sm: "flex-start" } }}
        >
          <AttachmentField recordType="User" recordId={userData?.id} name="avatar" variant="avatar" size={140} />

          <Box sx={{ flex: 1, width: "100%" }}>
            <Stack
              component="form"
              spacing={3}
              onSubmit={profileSync.handleSubmit((data) => profileMutation.mutate(data))}
              noValidate
            >
              <FormTextField
                control={profileForm.control}
                name="username"
                rules={usernameRules}
                label="Username"
                helperText={profileErrors.username?.message || "Optional: Choose a display name"}
              />

              <EmailField control={profileForm.control} name="emailAddress" rules={emailRules} label="Email Address" />

              <FormActions>
                <Button type="submit" variant="contained" disabled={profileMutation.isPending}>
                  <DiceSpinner size="small" loading={profileMutation.isPending}>
                    Save Changes
                  </DiceSpinner>
                </Button>
              </FormActions>
            </Stack>
          </Box>
        </Stack>
      </Section>

      <Section title="Linked Accounts">
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography>Google</Typography>
              {isGoogleLinked && <TagChip tag={{ label: "Linked", color: "success" }} />}
            </Stack>
            <Box sx={{ width: { xs: "100%", sm: 200 } }}>
              {isGoogleLinked ? (
                <Button
                  fullWidth
                  variant="contained"
                  color="error"
                  onClick={() => unlinkOauthMutation.mutate("google")}
                  disabled={unlinkOauthMutation.isPending || !hasPassword}
                >
                  <DiceSpinner size="small" loading={unlinkOauthMutation.isPending}>
                    Unlink
                  </DiceSpinner>
                </Button>
              ) : isGoogleAvailable ? (
                <GoogleSignInButton overlayRef={overlayRef} label="Link Google" />
              ) : null}
            </Box>
          </Stack>
          {isGoogleLinked && !hasPassword && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Set a password before unlinking Google
            </Typography>
          )}
        </Stack>
      </Section>

      <Section title={hasPassword ? "Change Password" : "Set Password"}>
        <Stack
          component="form"
          spacing={3}
          onSubmit={passwordForm.handleSubmit((data) => passwordMutation.mutate(data))}
          noValidate
        >
          {hasPassword && (
            <PasswordField
              control={passwordForm.control}
              name="currentPassword"
              rules={{ required: "Current password is required" }}
              label="Current Password"
              autoComplete="current-password"
            />
          )}

          <PasswordField
            control={passwordForm.control}
            name="newPassword"
            rules={newPasswordRules}
            label="New Password"
            autoComplete="new-password"
          />

          <PasswordField
            control={passwordForm.control}
            name="newPasswordConfirmation"
            rules={confirmPasswordRules<PasswordFormData>("newPassword")}
            label="Confirm New Password"
            autoComplete="new-password"
          />

          <FormActions>
            <Button type="submit" variant="contained" disabled={passwordMutation.isPending}>
              <DiceSpinner size="small" loading={passwordMutation.isPending}>
                {hasPassword ? "Update Password" : "Set Password"}
              </DiceSpinner>
            </Button>
          </FormActions>
        </Stack>
      </Section>

      <Section title="Delete Account" danger>
        <Typography variant="body2">
          Permanently delete your account and all associated data. This action cannot be undone.
        </Typography>
        <FormActions>
          <Button variant="contained" color="error" onClick={() => setDeleteDialogOpen(true)}>
            Delete Account
          </Button>
        </FormActions>
      </Section>

      {userData?.pendingEmailAddress && (
        <EmailChangeVerificationDialog
          open={verifyDialogOpen}
          onClose={() => setVerifyDialogOpen(false)}
          pendingEmail={userData.pendingEmailAddress}
        />
      )}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        hasPassword={hasPassword}
      />
    </PageBody>
  );
}
