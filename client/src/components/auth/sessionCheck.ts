import { signOutIfUnauthorized } from "@/client/src/lib/queryClient.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { AuthUser } from "@/client/src/stores/authUser.ts";

/**
 * Reconciles the store with the server's cookie, as the app opens a private page: `fetchUser` asks the server whose
 * session the cookie is (`/auth/me`), and the store keeps its answer. A user it remembers renders the page meanwhile,
 * and is the server's user once it answers: the same one stays as the store holds them, another takes their place, and
 * a 401 signs them out (any other failure keeps them: the server can't say, offline). Without one, the session is the
 * server's user, and one it refuses (a 401, any failure) is no session. An answer that comes once the store holds
 * another user (signed out, signed in as someone else) is too late, and changes nothing.
 */
export async function checkSession(fetchUser: () => Promise<AuthUser>) {
  const { isAuthenticated, user } = useAuthStore.getState();
  // A profile update meanwhile keeps the user
  function isUnchanged() {
    const current = useAuthStore.getState();
    return current.isAuthenticated === isAuthenticated && current.user?.id === user?.id;
  }
  try {
    const sessionUser = await fetchUser();
    if (isUnchanged() && (!isAuthenticated || sessionUser.id !== user?.id))
      useAuthStore.getState().startSession(sessionUser);
  } catch (error) {
    if (!isUnchanged()) return;
    // Through the query client, a 401 has signed out already (its cache's `onError`)
    if (isAuthenticated) signOutIfUnauthorized(error);
    else useAuthStore.setState({ user: null, isAuthenticated: false });
  }
}
