import { type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { UnauthorizedError } from "@/server/errors/index.ts";
import { Sessions, Users } from "@/server/repositories/index.ts";
import type { Session, User } from "@/shared/relations.ts";

import { db } from "@/server/database/index.ts";

export const SESSION_COOKIE_NAME = "session-id";
export const SESSION_CONTEXT_KEY = "requestSession";
export const USER_CONTEXT_KEY = "requestUser";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionContext = {
  Variables: {
    requestSession: Session;
    requestUser: User;
  };
};

export default createMiddleware<SessionContext>(async (c, next) => {
  const sessionId = getSessionCookie(c);
  if (!sessionId) throw new UnauthorizedError("Invalid session");

  const session = await Sessions.findOne(db, { id: sessionId });
  if (!session) throw new UnauthorizedError("Invalid session");
  if (new Date(session.expiresAt) < new Date()) throw new UnauthorizedError("Session expired");

  const user = await Users.findOne(db, { id: session.userId });
  if (!user) throw new UnauthorizedError("Invalid session");
  if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
    throw new UnauthorizedError("Session expired");
  }

  c.set(SESSION_CONTEXT_KEY, session);
  c.set(USER_CONTEXT_KEY, user);

  await next();
});

export function getSessionCookie(c: Context) {
  return getCookie(c, SESSION_COOKIE_NAME);
}

const isProduction = process.env.NODE_ENV === "production";

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function deleteSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME);
}
