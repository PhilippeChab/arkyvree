import { type QueryClient, useIsMutating, useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { type AuthUser, toAuthUser } from "@/client/src/stores/authUser.ts";

/** The server signed the user in: the store keeps them, and no email waits for its code any more. */
function signedIn(user: AuthUser) {
  useAuthStore.setState({
    user: toAuthUser(user),
    isAuthenticated: true,
    signedOutByUser: false,
    pendingVerificationEmail: null,
    pendingPasswordResetEmail: null,
  });
}

/**
 * Reconciles the store with the server's cookie, as the app opens a private page: a session the store doesn't know is
 * the server's user, and one the server refuses (a 401, any failure) is no session.
 */
export function checkSession(queryClient: QueryClient): Promise<void> {
  if (useAuthStore.getState().isAuthenticated) return Promise.resolve();
  return queryClient
    .fetchQuery({ queryKey: queryKeys.auth.me, queryFn: () => parseResponse(rpc.auth.me.$get()), staleTime: 0 })
    .then(
      (user) => signedIn(user),
      () => {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      },
    );
}

/**
 * The auth requests, each a mutation the store follows: sign in (with a password or Google), sign up, verify an email,
 * resend its code, ask for and make a password reset, sign out. They share one mutation key, so `pending` says whether
 * any is in flight, whichever page sent it, and the query client leaves their 401s to them (a wrong password, a session
 * already gone). A page shows a request's error through its `onError`. Where the user goes once the store changes is
 * the routes' to say, never the page's (React Router applies a navigation in a transition, which the store's render
 * would run ahead of): a signed-in user leaves the auth pages for where they were going (`AuthLayoutRoute`), and a
 * signed-out one leaves the private pages for sign in (`PrivateRoute`).
 */
export function useAuthRequests() {
  const mutationKey = queryKeys.auth.requests;
  const pending = useIsMutating({ mutationKey }) > 0;

  const signIn = useMutation({
    mutationKey,
    mutationFn: (json: { emailAddress: string; password: string }) =>
      parseResponse(rpc.auth["sign-in"].$post({ json })),
    onSuccess: signedIn,
    // An unverified email waits for its code
    onError: (error, { emailAddress }) => {
      const isUnverified = error instanceof Error && error.message === "Email not verified";
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        pendingVerificationEmail: isUnverified ? emailAddress : null,
      });
    },
  });

  const signInWithGoogle = useMutation({
    mutationKey,
    mutationFn: (idToken: string) => parseResponse(rpc.auth.google.$post({ json: { idToken } })),
    onSuccess: signedIn,
  });

  const signUp = useMutation({
    mutationKey,
    mutationFn: (json: { emailAddress: string; password: string; passwordConfirmation: string }) =>
      parseResponse(rpc.auth["sign-up"].$post({ json })),
    onSuccess: (_, { emailAddress }) => useAuthStore.setState({ pendingVerificationEmail: emailAddress }),
  });

  const verifyEmail = useMutation({
    mutationKey,
    mutationFn: (json: { emailAddress: string; code: string }) =>
      parseResponse(rpc.auth["verify-email"].$post({ json })),
    onSuccess: signedIn,
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
    mutationFn: (json: { emailAddress: string; code: string; newPassword: string; newPasswordConfirmation: string }) =>
      parseResponse(rpc.auth["reset-password"].$post({ json })),
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
    signUp,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    signOut,
  };
}
