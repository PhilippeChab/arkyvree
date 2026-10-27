import { type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import { db } from "@/server/database/index.ts";
import { isProduction } from "@/server/environment.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import { SESSION_TTL_SECONDS, Sessions, Users } from "@/server/repositories/index.ts";
import type { Session, User } from "@/shared/relations.ts";

export interface SessionContext {
  Variables: {
    requestSession: Session;
    requestUser: User;
  };
}

const SESSION_CONTEXT_KEY = "requestSession";
const USER_CONTEXT_KEY = "requestUser";

export const SESSION_COOKIE_NAME = "session-id";

export function deleteSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME);
}

/**
 * The session id a request's cookie holds: none when it holds none, or holds what isn't a session's id (a session's is a
 * UUID), which no session matches.
 */
export function getSessionCookie(c: Context): string | undefined {
  const id = z.string().uuid().safeParse(getCookie(c, SESSION_COOKIE_NAME));
  return id.success ? id.data : undefined;
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * The session a request's cookie (`sessionId`, `getSessionCookie`'s) signs in, and its user: refused when there's none,
 * or when the session or its user (a demo's) has expired. What every signed-in request and the websocket take.
 */
export async function findRequestSession(sessionId: string | undefined): Promise<{ session: Session; user: User }> {
  if (!sessionId) throw new UnauthorizedError("Invalid session");

  const session = await Sessions.findOne(db, { id: sessionId });
  if (!session) throw new UnauthorizedError("Invalid session");
  if (new Date(session.expiresAt) < new Date()) throw new UnauthorizedError("Session expired");

  const user = await Users.findOne(db, { id: session.userId });
  if (!user) throw new UnauthorizedError("Invalid session");
  if (user.expiresAt && new Date(user.expiresAt) < new Date()) throw new UnauthorizedError("Session expired");

  return { session, user };
}

/** `findRequestSession`'s answer, or null where it refuses: for a route that also serves a signed-out visitor. */
export async function findSignedIn(sessionId: string | undefined) {
  return await findRequestSession(sessionId).catch((error: unknown) => {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  });
}

export default createMiddleware<SessionContext>(async (c, next) => {
  const { session, user } = await findRequestSession(getSessionCookie(c));

  c.set(SESSION_CONTEXT_KEY, session);
  c.set(USER_CONTEXT_KEY, user);

  await next();
});
