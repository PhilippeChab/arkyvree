import { afterEach, describe, expect, test } from "bun:test";

import { hc, parseResponse } from "hono/client";

import { checkSession } from "@/client/src/components/auth/sessionCheck.ts";
import { createQueryClient } from "@/client/src/lib/queryClient.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { Sessions } from "@/server/repositories/index.ts";
import { application, type Application } from "@/server/routers/application.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A key the cache holds a page's data under, until the signed-in user changes. */
const CACHED_KEY = ["rulesets", "detail", "r1"];

/** The API served as the app reaches it: through `apiFetch`, with a session's cookie, or none. */
function serveApi() {
  const server = Bun.serve({ port: 0, fetch: (request) => application.fetch(request) });
  return {
    server,
    // What `/auth/me` answers the cookie of `sessionId`, as the app asks it
    fetchUserOf: (sessionId: string | null) => () =>
      parseResponse(
        hc<Application>(server.url.href, {
          fetch: apiFetch,
          headers: sessionId ? { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` } : {},
        }).auth.me.$get(),
      ),
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
});

describe("The session check, with a user the store remembers", () => {
  test("gives way to the session's user when the cookie is another's, and their cache goes with them", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const earlier = await createUserWithSession();
      const current = await createUserWithSession();
      const queryClient = createQueryClient();
      useAuthStore.getState().startSession(await fetchUserOf(earlier.sessionId)());
      queryClient.setQueryData(CACHED_KEY, { userId: earlier.user.id });

      await checkSession(fetchUserOf(current.sessionId));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: current.user.id } });
      expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
    } finally {
      await server.stop(true);
    }
  });

  test("stays signed in when the cookie is theirs, their cache kept", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { user, sessionId } = await createUserWithSession();
      const queryClient = createQueryClient();
      useAuthStore.getState().startSession(await fetchUserOf(sessionId)());
      queryClient.setQueryData(CACHED_KEY, { userId: user.id });

      await checkSession(fetchUserOf(sessionId));

      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: user.id } });
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
    const { user, sessionId } = await createUserWithSession();
    useAuthStore.getState().startSession(await fetchUserOf(sessionId)());
    await server.stop(true);

    await checkSession(fetchUserOf(sessionId));

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: user.id } });
  });

  test("changes nothing once the store has changed while it asked: a sign-out stands", async () => {
    const { server, fetchUserOf } = serveApi();
    try {
      const { sessionId } = await createUserWithSession();
      useAuthStore.getState().startSession(await fetchUserOf(sessionId)());

      const check = checkSession(fetchUserOf(sessionId));
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
