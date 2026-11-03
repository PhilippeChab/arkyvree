import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { UnauthorizedError } from "@/server/errors/index.ts";
import { findRequestSession, getSessionCookie, SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { createSignedInUser } from "@/tests/support/users.ts";

const cookieApp = new Hono().get("/", (c) => c.json({ sessionId: getSessionCookie(c) ?? null }));

const PAST = new Date(Date.now() - 60_000).toISOString();

/** The session id `getSessionCookie` reads off a request with `cookie`. */
async function read(cookie?: string) {
  const response = await cookieApp.request("/", cookie ? { headers: { cookie } } : {});
  return ((await response.json()) as { sessionId: string | null }).sessionId;
}

describe("findRequestSession", () => {
  test("answers a live session and its user", async () => {
    const { session, user } = await createSignedInUser();
    const found = await findRequestSession(session.id);
    expect(found.session.id).toBe(session.id);
    expect(found.user.id).toBe(user.id);
  });

  test("refuses no session, an unknown one and an expired one", async () => {
    expect(findRequestSession(undefined)).rejects.toThrow(UnauthorizedError);
    expect(findRequestSession(crypto.randomUUID())).rejects.toThrow(UnauthorizedError);
    const { session } = await createSignedInUser({ sessionExpiresAt: PAST });
    expect(findRequestSession(session.id)).rejects.toThrow("Session expired");
  });

  test("refuses the live session of an expired demo user", async () => {
    const { session } = await createSignedInUser({ expiresAt: PAST });
    expect(findRequestSession(session.id)).rejects.toThrow("Session expired");
  });
});

describe("getSessionCookie", () => {
  test("reads a session's id, and nothing from a cookie that holds none", async () => {
    const id = crypto.randomUUID();
    expect(await read(`${SESSION_COOKIE_NAME}=${id}`)).toBe(id);
    expect(await read()).toBeNull();
    expect(await read(`${SESSION_COOKIE_NAME}=not-a-session-id`)).toBeNull();
  });
});
