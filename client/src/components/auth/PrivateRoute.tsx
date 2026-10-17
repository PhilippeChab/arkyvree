import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { PageLoader } from "@/client/src/components/common/index.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { currentUserQuery } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { isDemoExpired } from "@/client/src/stores/demoExpiredStorage.ts";

import { authPagePath } from "./authRedirect.ts";
import { checkSession } from "./sessionCheck.ts";

/**
 * One-shot per browser-tab: probe /auth/me at most once, to confirm the user the store remembers or find the cookie's
 * when it remembers none, even if the visitor bounces between auth-only routes while unauth. Memoizing a Promise (rather than a boolean "started" flag) keeps strict-mode's double-effect honest — each
 * mount awaits the same probe and attaches its own .finally, so the surviving mount's callback fires after the first
 * cleanup cancels its peer.
 */
let authProbe: Promise<void> | null = null;

/**
 * The private pages' layout route: a signed-in user's, the one the store remembers at once while the session is probed
 * (`checkSession`); a signed-out one goes to sign in, which brings them back to the page once signed in, unless they
 * signed out of it (`AuthLayoutRoute` reads it back).
 */
export function PrivateRoute() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signedOutByUser = useAuthStore((s) => s.signedOutByUser);
  const userId = useAuthStore((s) => s.user?.id);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    authProbe ??= checkSession(() => queryClient.fetchQuery({ ...currentUserQuery(), staleTime: NO_TIME }));
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
  // Another user is another app: what its pages set up once for the last one (the onboarding tour) starts afresh
  if (isAuthenticated) return <Outlet key={userId} />;

  // Read-only here; DemoExpiredPage clears the flag on mount. Mutating during
  // render is unsafe under StrictMode's double-invoke (the second pass would
  // see an already-cleared flag and fall through to /sign-in).
  if (isDemoExpired()) return <Navigate to="/demo-expired" replace />;

  // Back to the page once signed in, unless the user signed out of it
  const target = location.pathname + location.search;
  return <Navigate to={authPagePath("/sign-in", target !== "/" && !signedOutByUser ? target : null)} replace />;
}
