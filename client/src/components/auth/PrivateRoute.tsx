import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { checkSession } from "@/client/src/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { isDemoExpired } from "@/client/src/stores/demoExpiredFlag.ts";

import { authPagePath } from "./authRedirect.ts";

/**
 * One-shot per browser-tab: probe /auth/me at most once even if the visitor bounces between auth-only routes while
 * unauth. Memoizing a Promise (rather than a boolean "started" flag) keeps strict-mode's double-effect honest — each
 * mount awaits the same probe and attaches its own .finally, so the surviving mount's callback fires after the first
 * cleanup cancels its peer.
 */
let authProbe: Promise<void> | null = null;

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

  if (!checked && !isAuthenticated) return null;
  if (isAuthenticated) return <Outlet />;

  // Read-only here; DemoExpiredPage clears the flag on mount. Mutating during
  // render is unsafe under StrictMode's double-invoke (the second pass would
  // see an already-cleared flag and fall through to /sign-in).
  if (isDemoExpired()) return <Navigate to="/demo-expired" replace />;

  // Back to the page once signed in, unless the user signed out of it
  const target = location.pathname + location.search;
  return <Navigate to={authPagePath("/sign-in", target !== "/" && !signedOutByUser ? target : null)} replace />;
}
