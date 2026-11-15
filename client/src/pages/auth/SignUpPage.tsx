import { Alert, type AlertColor, Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthPage, authPagePath, type AuthPageState, useAuthRedirect } from "@/client/src/components/auth/index.ts";
import { EmailField, LoadError, PasswordField } from "@/client/src/components/common/index.ts";
import { useAuthRequests, useFormWith, usePageTitle } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { inviteLinkStateQuery, signUpPolicyQuery } from "@/client/src/lib/queries.ts";
import { confirmPasswordRules, NEW_PASSWORD_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";
import { INVITE_LINK_MESSAGES, type InviteLinkState } from "@/shared/inviteLinks.ts";

import { AuthSubmitButton, GoogleSignInSection } from "./components/index.ts";
import { useInviteToken } from "./useInviteToken.ts";

type SignUpFormData = Omit<InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"], "inviteToken">;

/**
 * What the page says above its form about invites, on an instance that takes them alone (`policy`): that the invite
 * link the visitor opened (`inviteToken`) lets them in, why it doesn't (`inviteState`), or that signing up needs an
 * invite. Nothing while the link is being read, so no note shows and then changes.
 */
function describeInviteNote(
  policy: SignUpPolicy,
  inviteToken: string | undefined,
  inviteState: InviteLinkState | undefined,
): { severity: AlertColor; text: string } | null {
  if (policy !== "Invite Only") return null;
  if (inviteToken && !inviteState) return null;
  if (inviteState === "Valid") return { severity: "success", text: `You've been invited to this ${APP_NAME}.` };
  if (inviteToken && inviteState) return { severity: "error", text: INVITE_LINK_MESSAGES[inviteState] };
  return {
    severity: "info",
    text: `Signing up here needs an invite: use the address someone on this ${APP_NAME} invited to a campaign, a ruleset or a character, or the invite link they sent you.`,
  };
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
  // The invite link the visitor opened (`/sign-up?invite=…`), kept for the tab, if any: what it lets them do, read up
  // front
  const inviteToken = useInviteToken();
  const { data: invite, error: inviteError } = useQuery(inviteLinkStateQuery(inviteToken));
  const note = describeInviteNote(policy, inviteToken, invite?.state);

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
        {/* The note sits as near the first field as the fields sit to each other; without one, the first field's own
            top adds to the gap above the form */}
        <Stack component="form" onSubmit={handleSubmit(handleSignUp)} noValidate spacing={3} sx={{ pt: note ? 0 : 2 }}>
          {note && <Alert severity={note.severity}>{note.text}</Alert>}
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
