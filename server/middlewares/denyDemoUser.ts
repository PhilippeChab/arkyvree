import { createMiddleware } from "hono/factory";

import { ForbiddenError, UnauthorizedError } from "@/server/errors/index.ts";
import { type SessionContext } from "@/server/middlewares/session.ts";

export default createMiddleware<SessionContext>(async (c, next) => {
  const user = c.var.requestUser;
  if (!user) throw new UnauthorizedError("Invalid session");
  if (user.expiresAt) throw new ForbiddenError("Sign up to use this feature");
  await next();
});
