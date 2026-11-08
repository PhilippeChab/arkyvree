import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { hc, parseResponse } from "hono/client";

import { checkSession } from "@/client/src/components/auth/sessionCheck.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { createQueryClient } from "@/client/src/lib/queryClient.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { application, type Application } from "@/server/routers/application.ts";
import { createUserWithSession } from "@/tests/support/users.ts";

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

afterEach(() => {
  useAuthStore.getState().clearSession();
});

afterAll(async () => {
  await server.stop(true);
});

describe("The session check, with a user the store remembers", () => {
  test("gives way to the session's user when the cookie is another's", async () => {
    const earlier = await createUserWithSession({ prefix: "session-check" });
    const current = await createUserWithSession({ prefix: "session-check" });
    useAuthStore.getState().startSession(await fetchUserOf(earlier.session.id)());

    await checkSession(fetchUserOf(current.session.id));

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: current.user.id } });
  });

  test("leaves them be when the cookie is theirs", async () => {
    const { session } = await createUserWithSession({ prefix: "session-check" });
    useAuthStore.getState().startSession(await fetchUserOf(session.id)());
    const remembered = useAuthStore.getState().user;

    await checkSession(fetchUserOf(session.id));

    expect(useAuthStore.getState().user).toBe(remembered);
  });

  test("signs them out when the server knows no session (a 401)", async () => {
    const { session } = await createUserWithSession({ prefix: "session-check" });
    useAuthStore.getState().startSession(await fetchUserOf(session.id)());

    await checkSession(fetchUserOf(null));

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
  });
});
