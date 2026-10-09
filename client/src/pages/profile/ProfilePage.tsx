import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";
import { type ReactNode } from "react";

import { GoogleSignInButton } from "@/client/src/components/auth/index.ts";
import {
  AttachmentField,
  CardTitle,
  DiceSpinner,
  EmailField,
  FormTextField,
  LoadError,
  PageError,
  PageHeader,
  PageLoader,
  PageTransition,
  Panel,
  PasswordField,
  SaveButton,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormSync, useFormWith, useGoogleSignIn, usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { currentUserQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  confirmPasswordRules,
  EMAIL_RULES,
  NEW_PASSWORD_RULES,
  requiredRules,
  USERNAME_RULES,
} from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { AuthUser } from "@/client/src/stores/authUser.ts";

import { DeleteAccountDialog, EmailChangeVerificationDialog } from "./components/index.ts";
import { linkedAccountsQuery } from "./profileQueries.ts";

/** A password's change, as its request sends it (a password set for the first time sends the new one alone). */
type PasswordFormData = InferRequestType<typeof rpc.auth.password.$put>["json"];

interface ProfileCardProps {
  children: ReactNode;
  danger?: boolean;
  title: string;
}

/** The profile's fields, as its update sends them: each one held by its form, which sends what's filled in. */
type ProfileFormData = Required<InferRequestType<typeof rpc.auth.profile.$put>["json"]>;

const EMPTY_PASSWORD_FORM: PasswordFormData = { currentPassword: "", newPassword: "", newPasswordConfirmation: "" };

function ProfileCard({ title, children, danger = false }: ProfileCardProps) {
  return (
    <Panel spacing={danger ? 1 : 3} sx={[danger && { border: 1, borderColor: "error.main" }]}>
      <CardTitle danger={danger}>{title}</CardTitle>
      <Box>{children}</Box>
    </Panel>
  );
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
  const verifyDialog = useDialogState<string>();
  const deleteDialog = useDialogState();

  const { data: userData, isLoading, error: userError } = useQuery(currentUserQuery());

  const hasPassword = userData?.hasPassword ?? true;

  const { data: linkedAccounts, error: linkedAccountsError } = useQuery(linkedAccountsQuery());

  const isGoogleLinked = linkedAccounts?.some((a) => a.provider === "google") ?? false;

  const linkGoogle = useMutation({
    mutationFn: (idToken: string) => parseResponse(rpc.auth["link-google"].$post({ json: { idToken } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.linkedAccounts });
      snackbar.success("Google account linked");
    },
    onError: (error) => snackbar.error(error, "Failed to link Google account"),
  });
  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn((idToken) => linkGoogle.mutate(idToken));

  const unlinkOauthMutation = useMutation({
    mutationFn: (provider: string) => parseResponse(rpc.auth["unlink-oauth"].$post({ json: { provider } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.linkedAccounts });
      snackbar.success("Account unlinked");
    },
    onError: (error) => snackbar.error(error, "Failed to unlink account"),
  });

  const profileForm = useFormWith<ProfileFormData>({ username: "", emailAddress: "" });
  const profileSync = useFormSync(profileForm, userData && toProfileForm(userData));

  // Set-password (no password yet, e.g. Google-only accounts) uses the same
  // form minus the current password. It edits nothing the server holds: its sync starts it empty.
  const passwordForm = useFormWith<PasswordFormData>(EMPTY_PASSWORD_FORM);
  const passwordSync = useFormSync(passwordForm, EMPTY_PASSWORD_FORM);

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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.me });
      updateUser({
        emailAddress: data.emailAddress,
        username: data.username,
        pendingEmailAddress: data.pendingEmailAddress,
      });

      if (data.pendingEmailAddress) {
        verifyDialog.openWith(data.pendingEmailAddress);
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
        ? parseResponse(rpc.auth.password.$put({ json: data }))
        : parseResponse(
            rpc.auth["set-password"].$post({
              json: { newPassword: data.newPassword, newPasswordConfirmation: data.newPasswordConfirmation },
            }),
          ),
    onSuccess: () => {
      passwordSync.saved(EMPTY_PASSWORD_FORM);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.me });
      snackbar.success(hasPassword ? "Password updated" : "Password set");
    },
    onError: (error) => snackbar.error(error, hasPassword ? "Failed to update password" : "Failed to set password"),
  });

  const cancelEmailChangeMutation = useMutation({
    mutationFn: () => parseResponse(rpc.auth["cancel-email-change"].$post()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.me });
      updateUser({ pendingEmailAddress: null });
      snackbar.success("Email change cancelled");
    },
    onError: (error) => snackbar.error(error, "Failed to cancel email change"),
  });

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <PageLoader />
      </Container>
    );
  }

  // A failed background refetch keeps the loaded profile (and any edits in progress) on screen.
  if (!userData) {
    return (
      <Container maxWidth="lg">
        <PageError message={loadFailureMessage("Profile", userError)} />
      </Container>
    );
  }

  const { pendingEmailAddress } = userData;

  return (
    <PageTransition>
      {/* Deeper at the bottom, under the last card */}
      <Container maxWidth="lg" sx={{ pb: { xs: 5, sm: 7 } }}>
        <Stack spacing={4}>
          <PageHeader title="Profile" subtitle="Manage your account information and security settings" />

          <Stack spacing={3}>
            <ProfileCard title="Basic Information">
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 2, sm: 4 }}
                sx={{ alignItems: { xs: "center", sm: "flex-start" } }}
              >
                <AttachmentField name="avatar" label="Avatar" recordId={userData.id} />

                <Box sx={{ flex: 1, width: "100%" }}>
                  <Stack
                    component="form"
                    onSubmit={profileSync.handleSubmit((data) => profileMutation.mutate(data))}
                    noValidate
                    spacing={3}
                    sx={{ pt: 2, alignItems: "flex-start" }}
                  >
                    <FormTextField
                      control={profileForm.control}
                      name="username"
                      rules={USERNAME_RULES}
                      label="Username"
                      variant="outlined"
                      fullWidth
                      helperText="Optional: Choose a display name"
                    />

                    <EmailField
                      control={profileForm.control}
                      name="emailAddress"
                      rules={EMAIL_RULES}
                      label="Email Address"
                    />

                    {/* A new email waits for its code: verified in its dialog, or the change cancelled */}
                    {pendingEmailAddress && (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <Typography variant="body2">
                          Pending email change to <strong>{pendingEmailAddress}</strong>
                        </Typography>
                        <Button size="small" onClick={() => verifyDialog.openWith(pendingEmailAddress)}>
                          Verify
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => cancelEmailChangeMutation.mutate()}
                          disabled={cancelEmailChangeMutation.isPending}
                        >
                          <DiceSpinner size="small" loading={cancelEmailChangeMutation.isPending}>
                            Cancel Change
                          </DiceSpinner>
                        </Button>
                      </Stack>
                    )}

                    <SaveButton canSave={profileSync.isDirty} pending={profileMutation.isPending} />
                  </Stack>
                </Box>
              </Stack>
            </ProfileCard>

            <ProfileCard title="Linked Accounts">
              <Stack spacing={1}>
                {!!linkedAccountsError && !linkedAccounts && (
                  <LoadError what="Linked accounts" error={linkedAccountsError} />
                )}
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <Typography variant="body1">Google</Typography>
                    {isGoogleLinked && <StatusChip label="Linked" color="success" />}
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
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Set a password before unlinking Google
                  </Typography>
                )}
              </Stack>
            </ProfileCard>

            <ProfileCard title={hasPassword ? "Change Password" : "Set Password"}>
              <Stack
                component="form"
                onSubmit={passwordSync.handleSubmit((data) => passwordMutation.mutate(data))}
                noValidate
                spacing={3}
                sx={{ pt: 2, alignItems: "flex-start" }}
              >
                {hasPassword && (
                  <PasswordField
                    control={passwordForm.control}
                    name="currentPassword"
                    rules={requiredRules("Current password is required")}
                    label="Current Password"
                    autoComplete="current-password"
                  />
                )}

                <PasswordField
                  control={passwordForm.control}
                  name="newPassword"
                  rules={NEW_PASSWORD_RULES}
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

                <SaveButton
                  canSave={passwordSync.isDirty}
                  label={hasPassword ? "Update Password" : "Set Password"}
                  pending={passwordMutation.isPending}
                />
              </Stack>
            </ProfileCard>

            <ProfileCard title="Delete Account" danger>
              <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
                <Typography variant="body2">
                  Permanently delete your account, your characters and your campaign memberships. Your rulesets stay,
                  without an owner, for the characters, campaigns and contributors that use them. This action cannot be
                  undone.
                </Typography>
                <Button variant="contained" color="error" onClick={() => deleteDialog.openWith(true)}>
                  Delete Account
                </Button>
              </Stack>
            </ProfileCard>
          </Stack>

          {/* Each dialog keeps its form and its errors: mounted as it opens, let go once it has faded */}
          {verifyDialog.target !== null && (
            <EmailChangeVerificationDialog
              open={verifyDialog.open}
              onClose={verifyDialog.close}
              onExited={verifyDialog.onExited}
              pendingEmail={verifyDialog.target}
            />
          )}
        </Stack>

        {deleteDialog.target && (
          <DeleteAccountDialog
            open={deleteDialog.open}
            onClose={deleteDialog.close}
            onExited={deleteDialog.onExited}
            hasPassword={hasPassword}
          />
        )}
      </Container>
    </PageTransition>
  );
}
