import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { PageLoader } from "@/client/src/components/common/index.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { currentUserQuery } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { isDemoExpired } from "@/client/src/stores/demoExpiredStorage.ts";

import { authPagePath } from "./authRedirect.ts";

/**
 * One-shot per browser-tab: probe /auth/me at most once even if the visitor bounces between auth-only routes while
 * unauth. Memoizing a Promise (rather than a boolean "started" flag) keeps strict-mode's double-effect honest — each
 * mount awaits the same probe and attaches its own .finally, so the surviving mount's callback fires after the first
 * cleanup cancels its peer.
 */
let authProbe: Promise<void> | null = null;

/**
 * Reconciles the store with the server's cookie, as the app opens a private page: a session the store doesn't know is
 * the server's user, and one the server refuses (a 401, any failure) is no session.
 */
function checkSession(queryClient: QueryClient): Promise<void> {
  const { isAuthenticated, startSession } = useAuthStore.getState();
  if (isAuthenticated) return Promise.resolve();
  return queryClient.fetchQuery({ ...currentUserQuery(), staleTime: NO_TIME }).then(startSession, () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });
}

/**
 * The private pages' layout route: a signed-in user's, once the session is probed; a signed-out one goes to sign in,
 * which brings them back to the page once signed in, unless they signed out of it (`AuthLayoutRoute` reads it back).
 */
export function PrivateRoute() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signedOutByUser = useAuthStore((s) => s.signedOutByUser);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    authProbe ??= checkSession(queryClient);
    let cancelled = false;
    void authProbe.finally(() => {
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  // The session is being checked: the page loads, as an auth page does meanwhile (`AuthLayoutRoute`)
  if (!checked && !isAuthenticated) return <PageLoader />;
  if (isAuthenticated) return <Outlet />;

  // Read-only here; DemoExpiredPage clears the flag on mount. Mutating during
  // render is unsafe under StrictMode's double-invoke (the second pass would
  // see an already-cleared flag and fall through to /sign-in).
  if (isDemoExpired()) return <Navigate to="/demo-expired" replace />;

  // Back to the page once signed in, unless the user signed out of it
  const target = location.pathname + location.search;
  return <Navigate to={authPagePath("/sign-in", target !== "/" && !signedOutByUser ? target : null)} replace />;
}
