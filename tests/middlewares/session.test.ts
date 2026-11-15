import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { UnauthorizedError } from "@/server/errors/index.ts";
import {
  findRequestSession,
  getSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from "@/server/middlewares/session.ts";
import { withEnvironment } from "@/tests/support/environment.ts";
import { createUserWithSession } from "@/tests/support/users.ts";

const cookieApp = new Hono().get("/", (c) => c.json({ sessionId: getSessionCookie(c) ?? null }));

const PAST = new Date(Date.now() - 60_000).toISOString();

const setterApp = new Hono().get("/", (c) => {
  setSessionCookie(c, crypto.randomUUID());
  return c.body(null, 204);
});

/** The session id `getSessionCookie` reads off a request with `cookie`. */
async function read(cookie?: string) {
  const response = await cookieApp.request("/", cookie ? { headers: { cookie } } : {});
  return ((await response.json()) as { sessionId: string | null }).sessionId;
}

/** The cookie a request is answered with, the app reached at `appUrl` in production. */
async function readSetCookie(appUrl: string) {
  return await withEnvironment({ NODE_ENV: "production", APP_URL: appUrl }, async () => {
    const response = await setterApp.request("/");
    return response.headers.get("set-cookie") ?? "";
  });
}

describe("findRequestSession", () => {
  test("answers a live session and its user", async () => {
    const { session, user } = await createUserWithSession();
    const found = await findRequestSession(session.id);
    expect(found.session.id).toBe(session.id);
    expect(found.user.id).toBe(user.id);
  });

  test("refuses no session, an unknown one and an expired one", async () => {
    expect(findRequestSession(undefined)).rejects.toThrow(UnauthorizedError);
    expect(findRequestSession(crypto.randomUUID())).rejects.toThrow(UnauthorizedError);
    const { session } = await createUserWithSession({ sessionExpiresAt: PAST });
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

describe("setSessionCookie", () => {
  test("is secure over HTTPS, and plain on a self-hosted install served over HTTP", async () => {
    expect(await readSetCookie("https://rpg.example.com")).toContain("Secure");
    expect(await readSetCookie("http://192.168.1.20")).not.toContain("Secure");
  });
});
