import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_STORAGE_KEY } from "@/shared/auth.ts";

import type { AuthUser } from "./authUser.ts";

/** Who is signed in, and the emails waiting for a code. The requests that change it are `useAuthRequests`'. */
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  pendingVerificationEmail: string | null;
  pendingPasswordResetEmail: string | null;
  /** The user signed out (rather than the server ending the session): their private pages send them to sign in afresh */
  signedOutByUser: boolean;
  /** A demo's session ended: the private pages send the user to the demo-expired page, which clears it */
  demoExpired: boolean;
  clearDemoExpired: () => void;
  clearSession: (options?: { byUser?: boolean; demoExpired?: boolean }) => void;
  /** Merge fields into the signed-in user, e.g. after a profile update. */
  updateUser: (patch: Partial<AuthUser>) => void;
}

const signedOut = {
  user: null,
  isAuthenticated: false,
  pendingVerificationEmail: null,
  pendingPasswordResetEmail: null,
  signedOutByUser: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...signedOut,
      demoExpired: false,

      clearDemoExpired: () => {
        set({ demoExpired: false });
      },

      clearSession: ({ byUser = false, demoExpired = false } = {}) => {
        set({ ...signedOut, signedOutByUser: byUser, demoExpired });
      },

      updateUser: (patch) => {
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : null }));
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      // Version 0 stored the whole sign-in response, password digest included:
      // drop it, and checkSession (`useAuthRequests.ts`) reloads the user from /auth/me.
      version: 1,
      migrate: () => ({ user: null, isAuthenticated: false, demoExpired: false }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        demoExpired: state.demoExpired,
      }),
    },
  ),
);
