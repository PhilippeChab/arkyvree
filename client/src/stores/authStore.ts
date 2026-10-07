import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_STORAGE_KEY } from "@/shared/auth.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { type AuthUser, readAuthUser } from "./authUser.ts";

/** Who is signed in, and the emails waiting for a code. The requests that change it are `useAuthRequests`'. */
interface AuthState {
  clearSession: (options?: { byUser?: boolean }) => void;
  isAuthenticated: boolean;
  pendingPasswordResetEmail: string | null;
  pendingVerificationEmail: string | null;
  /** The user signed out (rather than the server ending the session): their private pages send them to sign in afresh */
  signedOutByUser: boolean;
  /** Merge fields into the signed-in user, e.g. after a profile update. */
  updateUser: (patch: Partial<AuthUser>) => void;
  user: AuthUser | null;
}

const SIGNED_OUT = {
  user: null,
  isAuthenticated: false,
  pendingVerificationEmail: null,
  pendingPasswordResetEmail: null,
  signedOutByUser: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...SIGNED_OUT,

      clearSession: ({ byUser = false } = {}) => {
        set({ ...SIGNED_OUT, signedOutByUser: byUser });
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
      // Only a user storage holds as one is taken back, signed in if it says so: anything else is signed out, and
      // checkSession asks the server
      merge: (persisted, current) => {
        const user = isRecord(persisted) ? readAuthUser(persisted.user) : null;
        const isAuthenticated = !!user && isRecord(persisted) && persisted.isAuthenticated === true;
        return { ...current, user, isAuthenticated };
      },
    },
  ),
);
