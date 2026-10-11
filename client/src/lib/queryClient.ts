import { matchMutation, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/client/src/services/ApiError.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { markDemoExpired } from "@/client/src/stores/demoExpiredFlag.ts";

import { FIVE_MINUTES } from "./durations.ts";
import { QUERY_KEYS } from "./queryKeys.ts";

/** A 401 signs the session out: the server no longer knows it. */
function handleGlobalError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    // Skip when already unauth — re-clearing on every 401 creates a refetch loop.
    if (!useAuthStore.getState().isAuthenticated) return;
    // If the cleared user was a demo, leave a breadcrumb so the post-clear
    // catch-all can route to /demo-expired instead of /sign-in.
    if (useAuthStore.getState().user?.expiresAt) markDemoExpired();

    useAuthStore.getState().clearSession();
  }
}

/**
 * The app's query client: a 401 from any query or mutation signs the session out, and the cache is cleared whenever the
 * signed-in user changes, so one user never sees another's data.
 */
export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: FIVE_MINUTES,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => handleGlobalError(error),
    }),
    // An auth request handles its own 401: a wrong password, a session already gone at sign-out
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!matchMutation({ mutationKey: QUERY_KEYS.auth.requests }, mutation)) handleGlobalError(error);
      },
    }),
  });

  // Seeded from current store so a localStorage-hydrated session that later
  // signs out triggers the clear. Assumes synchronous persist hydration.
  let lastUserId: string | null = useAuthStore.getState().user?.id ?? null;
  useAuthStore.subscribe((state) => {
    const userId = state.user?.id ?? null;
    if (userId !== lastUserId) {
      lastUserId = userId;
      queryClient.clear();
    }
  });

  return queryClient;
}
