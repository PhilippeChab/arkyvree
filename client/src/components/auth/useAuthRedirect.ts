import { useLocation } from "react-router-dom";

import { useSearchParam } from "@/client/src/hooks/index.ts";

import { authPageState, safeRedirectPath } from "./authRedirect.ts";

/**
 * Where the user on an auth page goes once signed in: the `redirect` that sent them to sign in, or the one an auth page
 * carried along in its router state (verifying an email), kept to this origin (`safeRedirectPath`); null for none.
 */
export function useAuthRedirect() {
  const { value } = useSearchParam("redirect");
  const location = useLocation();
  return safeRedirectPath(value || authPageState(location.state).redirect);
}
