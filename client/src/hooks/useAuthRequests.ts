import { type QueryClient, useIsMutating, useMutation } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { type AuthUser, toAuthUser } from "@/client/src/stores/authUser.ts";

/** What follows a request whose store update moves the page away (an auth page leaves once signed in). */
interface AuthNextSteps {
  /** After signing in, with a password or Google, or by verifying an email */
  onSignedIn?: () => void;
  onPasswordReset?: () => void;
  onSignedOut?: () => void;
}

/** The server signed the user in: the store keeps them, and no email waits for its code any more. */
function signedIn(user: AuthUser) {
  useAuthStore.setState({ user: toAuthUser(user), isAuthenticated: true, pendingVerificationEmail: null });
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
 * already gone). A page shows a request's error through its `onError`. A request whose store update moves the page away
 * takes what follows as an option, run in the same turn as the update: a `mutate` callback would come after the page
 * has gone.
 */
export function useAuthRequests({ onSignedIn, onPasswordReset, onSignedOut }: AuthNextSteps = {}) {
  const mutationKey = queryKeys.auth.requests;
  const pending = useIsMutating({ mutationKey }) > 0;

  const signIn = useMutation({
    mutationKey,
    mutationFn: (json: { emailAddress: string; password: string }) =>
      parseResponse(rpc.auth["sign-in"].$post({ json })),
    onSuccess: (user) => {
      signedIn(user);
      onSignedIn?.();
    },
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
    onSuccess: (user) => {
      signedIn(user);
      onSignedIn?.();
    },
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
    onSuccess: (user) => {
      signedIn(user);
      onSignedIn?.();
    },
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
    onSuccess: () => {
      useAuthStore.setState({ pendingPasswordResetEmail: null });
      onPasswordReset?.();
    },
  });

  // Signed out locally whatever the server says: one that failed (a session already gone, a network blip) ends there
  const signOut = useMutation({
    mutationKey,
    mutationFn: () => parseResponse(rpc.auth["sign-out"].$post()),
    onSettled: () => {
      useAuthStore.getState().clearSession();
      onSignedOut?.();
    },
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
