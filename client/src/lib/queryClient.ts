import { matchMutation, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { sessionEnded } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/** A session the server no longer knows signs the client out. */
function handleGlobalError(error: unknown) {
  if (sessionEnded(error)) {
    // Skip when already unauth — re-clearing on every 401 creates a refetch loop.
    if (!useAuthStore.getState().isAuthenticated) return;
    // A demo's ending sends its private pages to /demo-expired instead of /sign-in.
    useAuthStore.getState().clearSession({ demoExpired: !!useAuthStore.getState().user?.expiresAt });
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
        staleTime: 5 * 60 * 1000,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => handleGlobalError(error),
    }),
    // An auth request handles its own 401: a wrong password, a session already gone at sign-out
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!matchMutation({ mutationKey: queryKeys.auth.requests }, mutation)) handleGlobalError(error);
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
