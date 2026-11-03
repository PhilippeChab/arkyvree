import { useIsMutating, useMutation } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";

import { emailNotVerified } from "@/client/src/lib/errorMessage.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/** What a password reset sends: the code, the email it went to, and the new password twice. */
type ResetPasswordBody = InferRequestType<(typeof rpc.auth)["reset-password"]["$post"]>["json"];

type SignInBody = InferRequestType<(typeof rpc.auth)["sign-in"]["$post"]>["json"];

type SignUpBody = InferRequestType<(typeof rpc.auth)["sign-up"]["$post"]>["json"];

type VerifyEmailBody = InferRequestType<(typeof rpc.auth)["verify-email"]["$post"]>["json"];

/**
 * The auth requests, each a mutation the store follows: sign in (with a password or Google), start a demo, sign up,
 * verify an email, resend its code, ask for and make a password reset, sign out. They share one mutation key, so `pending` says whether
 * any is in flight, whichever page sent it, and the query client leaves their 401s to them (a wrong password, a session
 * already gone). A page shows a request's error through its `onError`. Where the user goes once the store changes is
 * the routes' to say, never the page's (React Router applies a navigation in a transition, which the store's render
 * would run ahead of): a signed-in user leaves the auth pages for where they were going (`AuthLayoutRoute`), and a
 * signed-out one leaves the private pages for sign in (`PrivateRoute`).
 */
export function useAuthRequests() {
  const startSession = useAuthStore((s) => s.startSession);
  const mutationKey = QUERY_KEYS.auth.requests;
  const pending = useIsMutating({ mutationKey }) > 0;

  const signIn = useMutation({
    mutationKey,
    mutationFn: (json: SignInBody) => parseResponse(rpc.auth["sign-in"].$post({ json })),
    onSuccess: startSession,
    // An unverified email waits for its code
    onError: (error, { emailAddress }) => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        pendingVerificationEmail: emailNotVerified(error) ? emailAddress : null,
      });
    },
  });

  const signInWithGoogle = useMutation({
    mutationKey,
    mutationFn: (idToken: string) => parseResponse(rpc.auth.google.$post({ json: { idToken } })),
    onSuccess: startSession,
  });

  // A demo account, signed in as any user is: the auth routes send it on, to the dashboard by default
  const startDemo = useMutation({
    mutationKey,
    mutationFn: () => parseResponse(rpc.api.demo.start.$post()),
    onSuccess: startSession,
  });

  const signUp = useMutation({
    mutationKey,
    mutationFn: (json: SignUpBody) => parseResponse(rpc.auth["sign-up"].$post({ json })),
    onSuccess: (_, { emailAddress }) => useAuthStore.setState({ pendingVerificationEmail: emailAddress }),
  });

  const verifyEmail = useMutation({
    mutationKey,
    mutationFn: (json: VerifyEmailBody) => parseResponse(rpc.auth["verify-email"].$post({ json })),
    onSuccess: startSession,
  });

  const resendVerification = useMutation({
    mutationKey,
    mutationFn: (emailAddress: string) =>
      parseResponse(rpc.auth["resend-verification"].$post({ json: { emailAddress } })),
  });

  const forgotPassword = useMutation({
    mutationKey,
    mutationFn: (emailAddress: string) => parseResponse(rpc.auth["forgot-password"].$post({ json: { emailAddress } })),
    onSuccess: (_, emailAddress) => useAuthStore.setState({ pendingPasswordResetEmail: emailAddress }),
  });

  const resetPassword = useMutation({
    mutationKey,
    mutationFn: (json: ResetPasswordBody) => parseResponse(rpc.auth["reset-password"].$post({ json })),
    // Its email waits until the user signs in: the reset page stays to send them there
  });

  // Signed out locally whatever the server says: one that failed (a session already gone, a network blip) ends there
  const signOut = useMutation({
    mutationKey,
    mutationFn: () => parseResponse(rpc.auth["sign-out"].$post()),
    onSettled: () => useAuthStore.getState().clearSession({ byUser: true }),
  });

  return {
    pending,
    signIn,
    signInWithGoogle,
    startDemo,
    signUp,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    signOut,
  };
}
