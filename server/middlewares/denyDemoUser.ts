import { createMiddleware } from "hono/factory";

import { ForbiddenError, SIGN_UP_MESSAGE, UnauthorizedError } from "@/server/errors/index.ts";

import { type SessionContext } from "./session.ts";

/**
 * Refuses a demo's session (`isDemo`) its account's own features: its profile, its API keys, its linked accounts, and
 * starting a campaign, which no record's policy is asked. A record's actions are its policy's.
 */
export default createMiddleware<SessionContext>(async (c, next) => {
  const session = c.var.requestSession;
  if (!session) throw new UnauthorizedError("Invalid session");
  if (session.isDemo) throw new ForbiddenError(SIGN_UP_MESSAGE);
  await next();
});
