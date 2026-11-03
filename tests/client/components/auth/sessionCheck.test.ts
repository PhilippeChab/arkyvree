import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { hc, parseResponse } from "hono/client";

import { checkSession } from "@/client/src/components/auth/sessionCheck.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { createQueryClient } from "@/client/src/lib/queryClient.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { Sessions } from "@/server/repositories/index.ts";
import { application, type Application } from "@/server/routers/application.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The app's query client, which the probe goes through as `PrivateRoute`'s does. */
const queryClient = createQueryClient();

/** The API, served as the app reaches it, through `apiFetch`. */
const server = Bun.serve({ port: 0, fetch: (request) => application.fetch(request) });

/** What `/auth/me` answers the cookie of `sessionId`, or none, asked as `PrivateRoute` asks it. */
function fetchUserOf(sessionId: string | null) {
  return () =>
    queryClient.fetchQuery({
      queryKey: QUERY_KEYS.auth.me,
      queryFn: () =>
        parseResponse(
          hc<Application>(server.url.href, {
            fetch: apiFetch,
            headers: sessionId ? { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` } : {},
          }).auth.me.$get(),
        ),
      staleTime: NO_TIME,
    });
}

/** A new user, and a session of theirs. */
async function createUserWithSession() {
  const { user } = await createTestUser("session-check");
  const [session] = await Sessions.create(db, { userId: user.id });
  return { user, sessionId: session.id };
}

afterEach(() => {
  useAuthStore.getState().clearSession();
});

afterAll(async () => {
  await server.stop(true);
});

describe("The session check, with a user the store remembers", () => {
  test("gives way to the session's user when the cookie is another's", async () => {
    const earlier = await createUserWithSession();
    const current = await createUserWithSession();
    useAuthStore.getState().startSession(await fetchUserOf(earlier.sessionId)());

    await checkSession(fetchUserOf(current.sessionId));

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: current.user.id } });
  });

  test("leaves them be when the cookie is theirs", async () => {
    const { sessionId } = await createUserWithSession();
    useAuthStore.getState().startSession(await fetchUserOf(sessionId)());
    const remembered = useAuthStore.getState().user;

    await checkSession(fetchUserOf(sessionId));

    expect(useAuthStore.getState().user).toBe(remembered);
  });

  test("signs them out when the server knows no session (a 401)", async () => {
    const { sessionId } = await createUserWithSession();
    useAuthStore.getState().startSession(await fetchUserOf(sessionId)());

    await checkSession(fetchUserOf(null));

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
  });
});
