import { AttachmentField, PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useGoogleSignIn, usePageTitle } from "@/client/src/hooks/index.ts";
import { GoogleSignInButton } from "@/client/src/components/auth";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
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
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
interface ProfileFormData {
  username?: string;
  emailAddress?: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

interface SetPasswordFormData {
  newPassword: string;
  newPasswordConfirmation: string;
}

export default function ProfilePage() {
  usePageTitle("Profile");
  const { isAuthenticated } = useAuthStore();

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
    queryFn: async () => {
      const response = await rpc.auth.me.$get();

      if (!response.ok) {
        throw new Error("Failed to fetch user data");
      }

      return response.json();
    },
    enabled: isAuthenticated,
  });

  const hasPassword = userData?.hasPassword ?? true;

  const { data: linkedAccounts } = useQuery({
    queryKey: queryKeys.auth.linkedAccounts,
    queryFn: async () => {
      const response = await rpc.auth["linked-accounts"].$get();
      if (!response.ok) throw new Error("Failed to fetch linked accounts");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const isGoogleLinked = linkedAccounts?.some((a) => a.provider === "google") ?? false;

  const handleGoogleLinkToken = useCallback(
    async (idToken: string) => {
      try {
        const response = await rpc.auth["link-google"].$post({ json: { idToken } });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to link Google account");
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
        snackbar.success("Google account linked");
      } catch (error) {
        snackbar.error(error, "Failed to link Google account");
      }
    },
    [queryClient, snackbar],
  );

  const { overlayRef, isAvailable: isGoogleAvailable } = useGoogleSignIn(handleGoogleLinkToken);

  const unlinkOauthMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await rpc.auth["unlink-oauth"].$post({ json: { provider } });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to unlink account");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.linkedAccounts });
      snackbar.success("Account unlinked");
    },
    onError: (error: Error) => {
      snackbar.error(error);
    },
  });

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    values: {
      username: userData?.username || "",
      emailAddress: userData?.emailAddress || "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    formState: { errors: passwordErrors },
    reset: resetPassword,
  } = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      newPasswordConfirmation: "",
    },
  });

  const {
    register: registerSetPassword,
    handleSubmit: handleSubmitSetPassword,
    formState: { errors: setPasswordErrors },
    reset: resetSetPassword,
  } = useForm<SetPasswordFormData>({
    defaultValues: {
      newPassword: "",
      newPasswordConfirmation: "",
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await rpc.auth.profile.$put({
        json: {
          username: data.username || undefined,
          emailAddress: data.emailAddress || undefined,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update profile");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });

      // Update auth store with new user data
      useAuthStore.setState({
        user: {
          id: data.id,
          emailAddress: data.emailAddress,
          name: data.username ?? undefined,
          pendingEmailAddress: data.pendingEmailAddress,
        },
      });

      if (data.pendingEmailAddress) {
        setVerifyDialogOpen(true);
        snackbar.success("Verification code sent to your new email");
      } else {
        snackbar.success("Profile updated successfully");
      }
    },
    onError: (error: Error) => {
      snackbar.error(error, "Failed to update profile");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await rpc.auth.password.$put({
        json: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          newPasswordConfirmation: data.newPasswordConfirmation,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update password");
      }

      return response.json();
    },
    onSuccess: () => {
      resetPassword();
      snackbar.success("Password updated successfully");
    },
    onError: (error: Error) => {
      snackbar.error(error, "Failed to update password");
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: SetPasswordFormData) => {
      const response = await rpc.auth["set-password"].$post({
        json: {
          newPassword: data.newPassword,
          newPasswordConfirmation: data.newPasswordConfirmation,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to set password");
      }

      return response.json();
    },
    onSuccess: () => {
      resetSetPassword();
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      snackbar.success("Password set successfully");
    },
    onError: (error: Error) => {
      snackbar.error(error, "Failed to set password");
    },
  });

  const cancelEmailChangeMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.auth["cancel-email-change"].$post();

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to cancel email change");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, pendingEmailAddress: null } : null,
      }));
      snackbar.success("Email change cancelled");
    },
    onError: (error: Error) => {
      snackbar.error(error, "Failed to cancel email change");
    },
  });

  const onSubmitProfile = async (data: ProfileFormData) => {
    profileMutation.mutate(data);
  };

  const onSubmitPassword = async (data: PasswordFormData) => {
    passwordMutation.mutate(data);
  };

  const onSubmitSetPassword = async (data: SetPasswordFormData) => {
    setPasswordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 400,
          }}
        >
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Typography variant="h6" color="error">
          Failed to load profile data. Please try again later.
        </Typography>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        {/* Header */}
        <Paper
          sx={{
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "white",
            p: { xs: 2, sm: 4 },
            borderRadius: 4,
            mb: 4,
          }}
        >
          <Typography sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: 800, mb: 1 }}>
            Profile
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Manage your account information and security settings
          </Typography>
        </Paper>

        {/* Pending Email Change Banner */}
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

        {/* Basic Information Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography sx={{ fontWeight: 700, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
              Basic Information
            </Typography>

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
                <form onSubmit={handleSubmitProfile(onSubmitProfile)} noValidate>
              <TextField
                {...registerProfile("username", {
                  minLength: {
                    value: 3,
                    message: "Username must be at least 3 characters",
                  },
                  maxLength: {
                    value: 50,
                    message: "Username must be at most 50 characters",
                  },
                })}
                label="Username"
                variant="outlined"
                fullWidth
                margin="normal"
                error={!!profileErrors.username}
                helperText={
                  profileErrors.username?.message ||
                  "Optional: Choose a display name"
                }
              />

              <TextField
                {...registerProfile("emailAddress", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Please enter a valid email address",
                  },
                })}
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
                {profileMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
                </form>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Linked Accounts Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography sx={{ fontWeight: 700, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
              Linked Accounts
            </Typography>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography variant="body1">Google</Typography>
                {isGoogleLinked && <Chip label="Linked" size="small" color="success" />}
              </Box>
              <Box sx={{ width: 200 }}>
                {isGoogleLinked ? (
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => unlinkOauthMutation.mutate("google")}
                    disabled={unlinkOauthMutation.isPending || !hasPassword}
                    sx={{ py: 1.5 }}
                  >
                    {unlinkOauthMutation.isPending ? "Unlinking..." : "Unlink"}
                  </Button>
                ) : isGoogleAvailable ? (
                  <GoogleSignInButton overlayRef={overlayRef} label="Link Google" />
                ) : null}
              </Box>
            </Box>
            {isGoogleLinked && !hasPassword && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  mt: 1,
                  display: "block"
                }}>
                Set a password before unlinking Google
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography sx={{ fontWeight: 700, mb: 3, typography: { xs: "h6", sm: "h5" } }}>
              {hasPassword ? "Change Password" : "Set Password"}
            </Typography>

            {hasPassword ? (
              <form onSubmit={handleSubmitPassword(onSubmitPassword)} noValidate>
                <TextField
                  {...registerPassword("currentPassword", {
                    required: "Current password is required",
                  })}
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

                <TextField
                  {...registerPassword("newPassword", {
                    required: "New password is required",
                    minLength: {
                      value: 12,
                      message: "Password must be at least 12 characters",
                    },
                  })}
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
                  {...registerPassword("newPasswordConfirmation", {
                    required: "Please confirm your new password",
                    validate: (value, formValues) =>
                      value === formValues.newPassword || "Passwords do not match",
                  })}
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
                  {passwordMutation.isPending ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmitSetPassword(onSubmitSetPassword)} noValidate>
                <TextField
                  {...registerSetPassword("newPassword", {
                    required: "Password is required",
                    minLength: {
                      value: 12,
                      message: "Password must be at least 12 characters",
                    },
                  })}
                  type="password"
                  label="New Password"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  error={!!setPasswordErrors.newPassword}
                  helperText={setPasswordErrors.newPassword?.message}
                  slotProps={{
                    htmlInput: { autoComplete: "new-password" }
                  }}
                />

                <TextField
                  {...registerSetPassword("newPasswordConfirmation", {
                    required: "Please confirm your password",
                    validate: (value, formValues) =>
                      value === formValues.newPassword || "Passwords do not match",
                  })}
                  type="password"
                  label="Confirm Password"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  error={!!setPasswordErrors.newPasswordConfirmation}
                  helperText={setPasswordErrors.newPasswordConfirmation?.message}
                  slotProps={{
                    htmlInput: { autoComplete: "new-password" }
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  sx={{ mt: 2 }}
                  disabled={setPasswordMutation.isPending}
                >
                  {setPasswordMutation.isPending ? "Setting..." : "Set Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        {/* Delete Account Section */}
        <Card sx={{ mb: 3, borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }}>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Typography sx={{ fontWeight: 700, mb: 1, color: "error.main", typography: { xs: "h6", sm: "h5" } }}>
              Delete Account
            </Typography>
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
          </CardContent>
        </Card>

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
