import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { type AuthUser, toAuthUser } from "@/client/src/stores/authUser.ts";

/** Whether `fresh` says anything of the user `held` doesn't. */
function differs(held: AuthUser, fresh: AuthUser) {
  return Object.entries(toAuthUser(fresh)).some(([field, value]) => held[field as keyof AuthUser] !== value);
}

/**
 * Reconciles the store with the server's cookie, as the app opens a private page: `fetchUser` asks the server whose
 * session the cookie is (`/auth/me`) through the query client, and the store keeps its answer. A user it remembers
 * renders the page meanwhile, and is the server's user once it answers: the same one stays, with the server's fields,
 * another takes their place, and a 401 signs them out, as any query's does (the query client's `onError`); any other
 * failure keeps them (the server can't say, offline). Without one, the session is the server's user, and a failure
 * leaves it signed out. An answer that comes once the session has changed (signed out, signed in again) is too late,
 * and changes nothing.
 */
export async function checkSession(fetchUser: () => Promise<AuthUser>) {
  const { isAuthenticated, user } = useAuthStore.getState();
  let sessionChanged = false;
  const unsubscribe = useAuthStore.subscribe((state, previous) => {
    if (state.isAuthenticated !== previous.isAuthenticated || state.user?.id !== previous.user?.id)
      sessionChanged = true;
  });
  try {
    const sessionUser = await fetchUser();
    if (sessionChanged) return;
    if (!isAuthenticated || !user || sessionUser.id !== user.id) useAuthStore.getState().startSession(sessionUser);
    // A profile update meanwhile is newer than the answer
    else if (useAuthStore.getState().user === user && differs(user, sessionUser))
      useAuthStore.getState().updateUser(toAuthUser(sessionUser));
  } catch {
    // The query client has handled it: a 401 is signed out
  } finally {
    unsubscribe();
  }
}
