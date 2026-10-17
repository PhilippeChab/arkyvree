import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { AuthUser } from "@/client/src/stores/authUser.ts";

/**
 * Reconciles the store with the server's cookie, as the app opens a private page: `fetchUser` asks `/auth/me` through
 * the query client. A user the store remembers renders the page meanwhile, and gives way to the server's when it's
 * another; a 401 signs them out, as any query's does, and another failure (offline) keeps them. With no user
 * remembered, the session is the server's user, and one it refuses is no session.
 */
export function checkSession(fetchUser: () => Promise<AuthUser>) {
  const { isAuthenticated, startSession } = useAuthStore.getState();
  return fetchUser().then(
    (user) => {
      if (user.id !== useAuthStore.getState().user?.id) startSession(user);
    },
    () => {
      if (!isAuthenticated) useAuthStore.setState({ user: null, isAuthenticated: false });
    },
  );
}
