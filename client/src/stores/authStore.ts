import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { InferResponseType } from "hono/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type MeResponse = InferResponseType<typeof rpc.auth.me.$get, 200>;
export type AuthUser = Pick<
  MeResponse,
  "id" | "emailAddress" | "username" | "pendingEmailAddress" | "onboardingCompletedAt" | "expiresAt"
>;

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pendingVerificationEmail: string | null;
  pendingPasswordResetEmail: string | null;
  signIn: (emailAddress: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (emailAddress: string, password: string, passwordConfirmation: string) => Promise<void>;
  verifyEmail: (emailAddress: string, code: string) => Promise<void>;
  resendVerification: (emailAddress: string) => Promise<void>;
  forgotPassword: (emailAddress: string) => Promise<void>;
  resetPassword: (emailAddress: string, code: string, newPassword: string, newPasswordConfirmation: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearSession: () => void;
  checkAuth: () => Promise<void>;
  /** Merge fields into the signed-in user, e.g. after a profile update. */
  updateUser: (patch: Partial<AuthUser>) => void;
}

const signedOut = {
  user: null,
  isAuthenticated: false,
  pendingVerificationEmail: null,
  pendingPasswordResetEmail: null,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      // Flags the request as in flight; errors propagate to the page, which
      // owns how they are shown.
      const track = async <T>(request: () => Promise<T>): Promise<T> => {
        set({ isLoading: true });
        try {
          return await request();
        } finally {
          set({ isLoading: false });
        }
      };

      const signedIn = (user: AuthUser) =>
        set({ user, isAuthenticated: true, pendingVerificationEmail: null });

      return {
        ...signedOut,
        isLoading: false,

        checkAuth: async () => {
          if (useAuthStore.getState().isAuthenticated) {
            return;
          }

          // checkAuth runs automatically on app mount to reconcile the auth
          // store with the server cookie. A 401 (or any other failure) here
          // just means the visitor isn't signed in.
          try {
            signedIn(await track(() => parseResponse(rpc.auth.me.$get())));
          } catch {
            set({ user: null, isAuthenticated: false });
          }
        },

        signIn: async (emailAddress, password) => {
          try {
            signedIn(await track(() => parseResponse(rpc.auth["sign-in"].$post({ json: { emailAddress, password } }))));
          } catch (error) {
            const isUnverified = error instanceof Error && error.message === "Email not verified";
            set({ user: null, isAuthenticated: false, pendingVerificationEmail: isUnverified ? emailAddress : null });
            throw error;
          }
        },

        signInWithGoogle: async (idToken) => {
          signedIn(await track(() => parseResponse(rpc.auth.google.$post({ json: { idToken } }))));
        },

        signUp: async (emailAddress, password, passwordConfirmation) => {
          await track(() => rpc.auth["sign-up"].$post({ json: { emailAddress, password, passwordConfirmation } }));
          set({ pendingVerificationEmail: emailAddress });
        },

        verifyEmail: async (emailAddress, code) => {
          signedIn(await track(() => parseResponse(rpc.auth["verify-email"].$post({ json: { emailAddress, code } }))));
        },

        resendVerification: async (emailAddress) => {
          await track(() => rpc.auth["resend-verification"].$post({ json: { emailAddress } }));
        },

        forgotPassword: async (emailAddress) => {
          await track(() => rpc.auth["forgot-password"].$post({ json: { emailAddress } }));
          set({ pendingPasswordResetEmail: emailAddress });
        },

        resetPassword: async (emailAddress, code, newPassword, newPasswordConfirmation) => {
          await track(() => rpc.auth["reset-password"].$post({
            json: { emailAddress, code, newPassword, newPasswordConfirmation },
          }));
          set({ pendingPasswordResetEmail: null });
        },

        signOut: async () => {
          await track(() => rpc.auth["sign-out"].$post());
          set(signedOut);
        },

        clearSession: () => {
          set({ ...signedOut, isLoading: false });
        },

        updateUser: (patch) => {
          set((state) => ({ user: state.user ? { ...state.user, ...patch } : null }));
        },
      };
    },
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
