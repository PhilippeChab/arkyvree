import { Alert, Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, authPagePath, type AuthPageState, useAuthRedirect } from "@/client/src/components/auth/index.ts";
import { EmailField, LoadError, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle, useSearchParam } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { inviteLinkStateQuery, signUpPolicyQuery } from "@/client/src/lib/queries.ts";
import { confirmPasswordRules, NEW_PASSWORD_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { INVITE_LINK_MESSAGES, type InviteLinkState } from "@/shared/inviteLinks.ts";

import { AuthSubmitButton, GoogleSignInSection } from "./components/index.ts";

interface InviteNoteProps {
  /** What the invite link the visitor opened reads as: none when they opened none, or it's being read. */
  inviteState: InviteLinkState | undefined;
}

type SignUpFormData = Omit<InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"], "inviteToken">;

/**
 * What the page says above its form about invites, on an instance that takes them alone: that an invite link let the
 * visitor in, why the one they opened doesn't, or that signing up needs an invite.
 */
function InviteNote({ inviteState }: InviteNoteProps) {
  if (inviteState === "Valid") return <Alert severity="success">You've been invited to this {APP_NAME}.</Alert>;
  if (inviteState) return <Alert severity="error">{INVITE_LINK_MESSAGES[inviteState]}</Alert>;
  return (
    <Alert severity="info">
      Signing up here needs an invite: use the address someone on this {APP_NAME} invited to a campaign, a ruleset or a
      character, or the invite link they sent you.
    </Alert>
  );
}

export default function SignUpPage() {
  usePageTitle("Sign Up");
  const auth = useAuthRequests();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const redirect = useAuthRedirect();
  // Who may sign up, once the instance has an admin (until then, anyone: its first account becomes its admin)
  const { data: signUp, error: signUpError } = useQuery(signUpPolicyQuery());
  const policy = signUp?.hasAdmin ? signUp.signUpPolicy : "Open";
  // The invite link the visitor opened (`/sign-up?invite=…`), if any: what it lets them do, read up front
  const inviteToken = useSearchParam("invite").value || undefined;
  const { data: invite, error: inviteError } = useQuery(inviteLinkStateQuery(inviteToken));

  const { control, handleSubmit } = useFormWith<SignUpFormData>({
    emailAddress: "",
    password: "",
    passwordConfirmation: "",
  });

  const handleSignUp = (data: SignUpFormData) => {
    setError(null);
    auth.signUp.mutate(
      { ...data, inviteToken },
      {
        onSuccess: () => navigate("/verify-email", { state: { redirect } satisfies AuthPageState }),
        onError: (error) => setError(errorMessage(error, "Failed to sign up")),
      },
    );
  };

  const signInLink = (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="body2">
        Already have an account?{" "}
        <MuiLink component={Link} to={authPagePath("/sign-in", redirect)} underline="hover">
          Sign in
        </MuiLink>
      </Typography>
    </Box>
  );

  if (policy === "Closed") {
    return (
      <AuthPage title="Sign Up">
        <Stack spacing={4} sx={{ pt: 2 }}>
          <Typography variant="body1" component="p">
            This {APP_NAME} isn't taking new accounts.
          </Typography>
          {signInLink}
        </Stack>
      </AuthPage>
    );
  }

  return (
    <AuthPage error={error} title="Sign Up">
      <Stack spacing={4}>
        {/* The setting unread: the form stays, and the server answers what it allows */}
        {!!signUpError && <LoadError what="Sign-up setting" error={signUpError} />}
        {!!inviteError && <LoadError what="Invite link" error={inviteError} />}
        {policy === "Invite Only" && <InviteNote inviteState={inviteToken ? invite?.state : undefined} />}
        {/* The first field's own top, which adds to the gap above the form */}
        <Stack component="form" onSubmit={handleSubmit(handleSignUp)} noValidate spacing={3} sx={{ pt: 2 }}>
          <EmailField control={control} name="emailAddress" />

          <PasswordField
            control={control}
            name="password"
            rules={NEW_PASSWORD_RULES}
            label="Password"
            autoComplete="new-password"
          />

          <PasswordField
            control={control}
            name="passwordConfirmation"
            rules={confirmPasswordRules<SignUpFormData>("password")}
            label="Confirm Password"
            autoComplete="new-password"
          />

          <AuthSubmitButton pending={auth.pending}>Sign Up</AuthSubmitButton>
        </Stack>
        <Stack spacing={2}>
          <GoogleSignInSection
            label="Sign Up with Google"
            inviteToken={inviteToken}
            disabled={auth.pending}
            onError={(error) => setError(errorMessage(error, "Failed to sign up with Google"))}
          />
          {signInLink}
        </Stack>
      </Stack>
    </AuthPage>
  );
}
