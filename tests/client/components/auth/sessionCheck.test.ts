import { afterEach, describe, expect, test } from "bun:test";

import { hc, parseResponse } from "hono/client";

import { checkSession } from "@/client/src/components/auth/sessionCheck.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { createQueryClient } from "@/client/src/lib/queryClient.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { db } from "@/server/database/index.ts";
import { Sessions } from "@/server/repositories/index.ts";
import { application, type Application } from "@/server/routers/application.ts";
import { sessionHeaders } from "@/tests/support/clients.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A key the cache holds a page's data under, until the signed-in user changes. */
const CACHED_KEY = ["rulesets", "detail", "r1"];

/** The app's query client, which the probe goes through as `PrivateRoute`'s does. */
const queryClient = createQueryClient();

/** The API served as the app reaches it: through `apiFetch` and the query client, with a session's cookie, or none. */
function serveApi() {
  const server = Bun.serve({ port: 0, fetch: (request) => application.fetch(request) });
  return {
    server,
    // What `/auth/me` answers the cookie of `sessionId`, asked as the app asks it: `currentUserQuery`'s key and
    // options, its request sent to this server (the app's `rpc` reads the page's origin, which a test has none of)
    fetchUserOf: (sessionId: string | null) => () =>
      queryClient.fetchQuery({
        queryKey: QUERY_KEYS.auth.me,
        queryFn: () =>
          parseResponse(
            hc<Application>(server.url.href, {
              fetch: apiFetch,
              headers: sessionId ? sessionHeaders(sessionId) : {},
            }).auth.me.$get(),
          ),
        staleTime: NO_TIME,
      }),
  };
}

/** A new user, and a session of theirs. */
async function createUserWithSession() {
  const { user } = await createTestUser("session-check");
  const [session] = await Sessions.create(db, { userId: user.id });
  return { user, sessionId: session.id };
}

afterEach(() => {
  useAuthStore.getState().clearSession();
  queryClient.clear();
});

describe("The session check, with a user the store remembers", () => {
  test("gives way to the session's user when the cookie is another's, and their cache goes with them", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const earlier = await createUserWithSession();
      const current = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(earlier.sessionId)());
      queryClient.setQueryData(CACHED_KEY, { userId: earlier.user.id });

      await checkSession(fetchUserOf(current.sessionId));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: current.user.id } });
      expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
    } finally {
      await server.stop(true);
    }
  });

  test("gives way to the session's user even when the remembered one's profile changed while it asked", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const earlier = await createUserWithSession();
      const current = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(earlier.sessionId)());

      const check = checkSession(fetchUserOf(current.sessionId));
      useAuthStore.getState().updateUser({ onboardingCompletedAt: new Date().toISOString() });
      await check;

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: current.user.id } });
    } finally {
      await server.stop(true);
    }
  });

  test("takes the server's fields when the cookie is theirs and storage held older ones", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { user, sessionId } = await createUserWithSession();
      const sessionUser = await fetchUserOf(sessionId)();
      useAuthStore.getState().startSession({ ...sessionUser, username: "stale-name" });

      await checkSession(fetchUserOf(sessionId));

      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        user: { id: user.id, username: user.username },
      });
    } finally {
      await server.stop(true);
    }
  });

  test("keeps a profile update made while it asked over the server's older answer", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { user, sessionId } = await createUserWithSession();
      useAuthStore.getState().startSession({ ...(await fetchUserOf(sessionId)()), username: "stale-name" });

      const check = checkSession(fetchUserOf(sessionId));
      useAuthStore.getState().updateUser({ username: "renamed" });
      await check;

      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        user: { id: user.id, username: "renamed" },
      });
    } finally {
      await server.stop(true);
    }
  });

  test("leaves them as the store holds them when the cookie is theirs, their cache kept", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { user, sessionId } = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(sessionId)());
      const remembered = useAuthStore.getState().user;
      queryClient.setQueryData(CACHED_KEY, { userId: user.id });

      await checkSession(fetchUserOf(sessionId));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true });
      expect(useAuthStore.getState().user).toBe(remembered);
      expect(queryClient.getQueryData<{ userId: string }>(CACHED_KEY)).toEqual({ userId: user.id });
    } finally {
      await server.stop(true);
    }
  });

  test("signs out when the server knows no session (a 401)", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { sessionId } = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(sessionId)());

      await checkSession(fetchUserOf(null));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
    } finally {
      await server.stop(true);
    }
  });

  test("keeps them when the server can't be reached, offline", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { user, sessionId } = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(sessionId)());
      await server.stop(true);

      await checkSession(fetchUserOf(sessionId));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: user.id } });
    } finally {
      await server.stop(true);
    }
  });

  test("changes nothing once the session has changed while it asked, even back to the same user", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const earlier = await createUserWithSession();
      const current = await createUserWithSession();
      const remembered = await fetchUserOf(earlier.sessionId)();
      useAuthStore.getState().startSession(remembered);

      const check = checkSession(fetchUserOf(current.sessionId));
      useAuthStore.getState().clearSession({ byUser: true });
      useAuthStore.getState().startSession(remembered);
      await check;

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: earlier.user.id } });
    } finally {
      await server.stop(true);
    }
  });

  test("changes nothing once the store has changed while it asked: a sign-out stands", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const earlier = await createUserWithSession();
      const current = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(earlier.sessionId)());

      const check = checkSession(fetchUserOf(current.sessionId));
      useAuthStore.getState().clearSession({ byUser: true });
      await check;

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null, signedOutByUser: true });
    } finally {
      await server.stop(true);
    }
  });
});

describe("The session check, with no user the store remembers", () => {
  test("signs in the session's user, or stays signed out when the server knows none", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      await checkSession(fetchUserOf(null));
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });

      const { user, sessionId } = await createUserWithSession();
      await checkSession(fetchUserOf(sessionId));
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: user.id } });
    } finally {
      await server.stop(true);
    }
  });
});
