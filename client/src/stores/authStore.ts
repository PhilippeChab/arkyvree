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
  clearSession: () => void;
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
    (set) => ({
      ...signedOut,

      clearSession: () => {
        set(signedOut);
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
      migrate: () => ({ user: null, isAuthenticated: false }),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
