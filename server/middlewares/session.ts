import { type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { db } from "@/server/database/index.ts";
import { isProduction } from "@/server/environment.ts";
import { SessionError } from "@/server/errors/index.ts";
import { SESSION_TTL_SECONDS, Sessions, Users } from "@/server/repositories/index.ts";
import type { Session, User } from "@/shared/relations.ts";

export type SessionContext = {
  Variables: {
    requestSession: Session;
    requestUser: User;
  };
};

const SESSION_CONTEXT_KEY = "requestSession";
const USER_CONTEXT_KEY = "requestUser";

export const SESSION_COOKIE_NAME = "session-id";

export function getSessionCookie(c: Context) {
  return getCookie(c, SESSION_COOKIE_NAME);
}

export default createMiddleware<SessionContext>(async (c, next) => {
  const sessionId = getSessionCookie(c);
  if (!sessionId) throw new SessionError("Invalid session");

  const session = await Sessions.findOne(db, { id: sessionId });
  if (!session) throw new SessionError("Invalid session");
  if (new Date(session.expiresAt) < new Date()) throw new SessionError("Session expired");

  const user = await Users.findOne(db, { id: session.userId });
  if (!user) throw new SessionError("Invalid session");
  if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
    throw new SessionError("Session expired");
  }

  c.set(SESSION_CONTEXT_KEY, session);
  c.set(USER_CONTEXT_KEY, user);

  await next();
});

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function deleteSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME);
}
