import { rpc } from "@/client/src/services/rpc.ts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  emailAddress: string;
  name?: string;
  pendingEmailAddress?: string | null;
  onboardingCompletedAt?: string | null;
  expiresAt?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      pendingVerificationEmail: null,
      pendingPasswordResetEmail: null,

      checkAuth: async () => {
        if (useAuthStore.getState().isAuthenticated) {
          return;
        }

        // checkAuth runs automatically on app mount to reconcile the auth
        // store with the server cookie. A 401 (or any other failure) here
        // just means the visitor isn't signed in — leave the store silent
        // so the next page (e.g. SignIn) doesn't show a stale error from
        // an unrelated background call.
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth.me.$get();
          if (response.ok) {
            const user = await response.json();
            set({ user, isAuthenticated: true, isLoading: false });
            return;
          }
        } catch {
          // fall through
        }
        set({ user: null, isAuthenticated: false, isLoading: false });
      },

      signIn: async (emailAddress: string, password: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["sign-in"].$post({
            json: { emailAddress, password },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to sign in");
          }

          const user = await response.json();
          set({ user, isAuthenticated: true, isLoading: false, pendingVerificationEmail: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to sign in";
          const isUnverified = message === "Email not verified";
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: isUnverified ? null : message,
            pendingVerificationEmail: isUnverified ? emailAddress : null,
          });
          throw error;
        }
      },

      signInWithGoogle: async (idToken: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth.google.$post({
            json: { idToken },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to sign in with Google");
          }

          const user = await response.json();
          set({ user, isAuthenticated: true, isLoading: false, pendingVerificationEmail: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to sign in with Google";
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: message,
          });
          throw error;
        }
      },

      signUp: async (emailAddress: string, password: string, passwordConfirmation: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["sign-up"].$post({
            json: { emailAddress, password, passwordConfirmation },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to sign up");
          }

          set({ isLoading: false, pendingVerificationEmail: emailAddress });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to sign up",
          });
          throw error;
        }
      },

      verifyEmail: async (emailAddress: string, code: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["verify-email"].$post({
            json: { emailAddress, code },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Invalid verification code");
          }

          const user = await response.json();
          set({ user, isAuthenticated: true, isLoading: false, pendingVerificationEmail: null });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Verification failed",
          });
          throw error;
        }
      },

      resendVerification: async (emailAddress: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["resend-verification"].$post({
            json: { emailAddress },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to resend verification");
          }

          set({ isLoading: false });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to resend verification",
          });
          throw error;
        }
      },

      forgotPassword: async (emailAddress: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["forgot-password"].$post({
            json: { emailAddress },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to send reset code");
          }

          set({ isLoading: false, pendingPasswordResetEmail: emailAddress });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to send reset code",
          });
          throw error;
        }
      },

      resetPassword: async (emailAddress: string, code: string, newPassword: string, newPasswordConfirmation: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["reset-password"].$post({
            json: { emailAddress, code, newPassword, newPasswordConfirmation },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to reset password");
          }

          set({ isLoading: false, pendingPasswordResetEmail: null });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to reset password",
          });
          throw error;
        }
      },

      signOut: async () => {
        try {
          set({ isLoading: true, error: null });
          const response = await rpc.auth["sign-out"].$post();

          if (!response.ok) {
            throw new Error("Failed to sign out");
          }

          set({ user: null, isAuthenticated: false, isLoading: false, pendingVerificationEmail: null });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to sign out",
          });
          throw error;
        }
      },

      clearSession: () => {
        set({ user: null, isAuthenticated: false, isLoading: false, error: null, pendingVerificationEmail: null, pendingPasswordResetEmail: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
