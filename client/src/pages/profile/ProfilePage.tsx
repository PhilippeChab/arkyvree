import { AttachmentField, DiceSpinner, PageHeader, PageTransition } from "@/client/src/components/common/index.ts";
import { GoogleSignInButton } from "@/client/src/components/auth/index.ts";
import { useFormSync, useGoogleSignIn, usePageTitle } from "@/client/src/hooks/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { confirmPasswordRules, emailRules, newPasswordRules } from "@/client/src/lib/validation.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { DeleteAccountDialog, EmailChangeVerificationDialog } from "@/client/src/pages/profile/components/index.ts";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

interface ProfileFormData {
  username: string;
  emailAddress: string;
}

const toProfileForm = (user: { username: string | null; emailAddress: string }): ProfileFormData => ({
  username: user.username ?? "",
  emailAddress: user.emailAddress,
});

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

function ProfileCard({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <Card sx={{ mb: 3, ...(danger && { borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }) }}>
      <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
        <Typography
          component="h2"
          sx={{ fontWeight: 700, mb: danger ? 1 : 3, typography: { xs: "h6", sm: "h5" }, color: danger ? "error.main" : undefined }}
        >
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  usePageTitle("Profile");
  const updateUser = useAuthStore((s) => s.updateUser);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: userData, isLoading, error } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => parseResponse(rpc.auth.me.$get()),
  });

  const hasPassword = userData?.hasPassword ?? true;

  const { data: linkedAccounts } = useQuery({
    queryKey: queryKeys.auth.linkedAccounts,
    queryFn: () => parseResponse(rpc.auth["linked-accounts"].$get()),
  });

  const isGoogleLinked = linkedAccounts?.some((a) => a.provider === "google") ?? false;

  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn(async (idToken) => {
    try {
      await rpc.auth["link-google"].$post({ json: { idToken } });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
      snackbar.success("Google account linked");
    } catch (error) {
      snackbar.error(error, "Failed to link Google account");
    }
  });

  const unlinkOauthMutation = useMutation({
    mutationFn: (provider: string) => rpc.auth["unlink-oauth"].$post({ json: { provider } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
      snackbar.success("Account unlinked");
    },
    onError: (error) => snackbar.error(error, "Failed to unlink account"),
  });

  const profileForm = useForm<ProfileFormData>({ defaultValues: { username: "", emailAddress: "" } });
  useFormSync(profileForm, userData && toProfileForm(userData));

  // Set-password (no password yet, e.g. Google-only accounts) uses the same
  // form minus the current password.
  const passwordForm = useForm<PasswordFormData>({
    defaultValues: { currentPassword: "", newPassword: "", newPasswordConfirmation: "" },
  });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileFormData) => parseResponse(rpc.auth.profile.$put({
      json: {
        username: data.username || undefined,
        emailAddress: data.emailAddress || undefined,
      },
    })),
    onSuccess: (data) => {
      // The server's values, not the submitted ones: a new email stays pending
      // until verified, so the field keeps the current address.
      profileForm.reset(toProfileForm(data));
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
        snackbar.success("Profile updated successfully");
      }
    },
    onError: (error) => snackbar.error(error, "Failed to update profile"),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordFormData) => hasPassword
      ? rpc.auth.password.$put({ json: data })
      : rpc.auth["set-password"].$post({
        json: { newPassword: data.newPassword, newPasswordConfirmation: data.newPasswordConfirmation },
      }),
    onSuccess: () => {
      passwordForm.reset();
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      snackbar.success(hasPassword ? "Password updated successfully" : "Password set successfully");
    },
    onError: (error) => snackbar.error(error, hasPassword ? "Failed to update password" : "Failed to set password"),
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
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Alert severity="error">Failed to load profile data. Please try again later.</Alert>
      </Container>
    );
  }

  const profileErrors = profileForm.formState.errors;
  const passwordErrors = passwordForm.formState.errors;

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <PageHeader title="Profile" subtitle="Manage your account information and security settings" />

        {userData?.pendingEmailAddress && (
          <Alert
            severity="info"
            sx={{ mb: 3 }}
            action={
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setVerifyDialogOpen(true)}
                >
                  Verify
                </Button>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => cancelEmailChangeMutation.mutate()}
                  disabled={cancelEmailChangeMutation.isPending}
                >
                  Cancel
                </Button>
              </Box>
            }
          >
            Pending email change to <strong>{userData.pendingEmailAddress}</strong>
          </Alert>
        )}

        <ProfileCard title="Basic Information">
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "center", sm: "flex-start" },
              gap: { xs: 2, sm: 4 },
            }}
          >
            <AttachmentField
              recordType="User"
              recordId={userData?.id}
              name="avatar"
              variant="avatar"
              size={140}
            />

            <Box sx={{ flex: 1, width: "100%" }}>
              <form onSubmit={profileForm.handleSubmit((data) => profileMutation.mutate(data))} noValidate>
                <TextField
                  {...profileForm.register("username", {
                    minLength: { value: 3, message: "Username must be at least 3 characters" },
                    maxLength: { value: 50, message: "Username must be at most 50 characters" },
                  })}
                  label="Username"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  error={!!profileErrors.username}
                  helperText={profileErrors.username?.message || "Optional: Choose a display name"}
                />

                <TextField
                  {...profileForm.register("emailAddress", emailRules)}
                  label="Email Address"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  error={!!profileErrors.emailAddress}
                  helperText={profileErrors.emailAddress?.message}
                  type="email"
                  slotProps={{
                    htmlInput: { autoComplete: "email" }
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  sx={{ mt: 2 }}
                  disabled={profileMutation.isPending}
                >
                  <DiceSpinner size="small" loading={profileMutation.isPending}>Save Changes</DiceSpinner>
                </Button>
              </form>
            </Box>
          </Box>
        </ProfileCard>

        <ProfileCard title="Linked Accounts">
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="body1">Google</Typography>
              {isGoogleLinked && <Chip label="Linked" size="small" color="success" />}
            </Box>
            <Box sx={{ width: { xs: "100%", sm: 200 } }}>
              {isGoogleLinked ? (
                <Button
                  fullWidth
                  variant="contained"
                  color="error"
                  onClick={() => unlinkOauthMutation.mutate("google")}
                  disabled={unlinkOauthMutation.isPending || !hasPassword}
                >
                  <DiceSpinner size="small" loading={unlinkOauthMutation.isPending}>Unlink</DiceSpinner>
                </Button>
              ) : isGoogleAvailable ? (
                <GoogleSignInButton overlayRef={overlayRef} label="Link Google" />
              ) : null}
            </Box>
          </Box>
          {isGoogleLinked && !hasPassword && (
            <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
              Set a password before unlinking Google
            </Typography>
          )}
        </ProfileCard>

        <ProfileCard title={hasPassword ? "Change Password" : "Set Password"}>
          <form onSubmit={passwordForm.handleSubmit((data) => passwordMutation.mutate(data))} noValidate>
            {hasPassword && (
              <TextField
                {...passwordForm.register("currentPassword", { required: "Current password is required" })}
                type="password"
                label="Current Password"
                variant="outlined"
                fullWidth
                margin="normal"
                error={!!passwordErrors.currentPassword}
                helperText={passwordErrors.currentPassword?.message}
                slotProps={{
                  htmlInput: { autoComplete: "current-password" }
                }}
              />
            )}

            <TextField
              {...passwordForm.register("newPassword", newPasswordRules)}
              type="password"
              label="New Password"
              variant="outlined"
              fullWidth
              margin="normal"
              error={!!passwordErrors.newPassword}
              helperText={passwordErrors.newPassword?.message}
              slotProps={{
                htmlInput: { autoComplete: "new-password" }
              }}
            />

            <TextField
              {...passwordForm.register("newPasswordConfirmation", confirmPasswordRules<PasswordFormData>("newPassword"))}
              type="password"
              label="Confirm New Password"
              variant="outlined"
              fullWidth
              margin="normal"
              error={!!passwordErrors.newPasswordConfirmation}
              helperText={passwordErrors.newPasswordConfirmation?.message}
              slotProps={{
                htmlInput: { autoComplete: "new-password" }
              }}
            />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              sx={{ mt: 2 }}
              disabled={passwordMutation.isPending}
            >
              <DiceSpinner size="small" loading={passwordMutation.isPending}>
                {hasPassword ? "Update Password" : "Set Password"}
              </DiceSpinner>
            </Button>
          </form>
        </ProfileCard>

        <ProfileCard title="Delete Account" danger>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </Typography>
          <Button
            variant="contained"
            color="error"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete Account
          </Button>
        </ProfileCard>

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
      </Container>
    </PageTransition>
  );
}
