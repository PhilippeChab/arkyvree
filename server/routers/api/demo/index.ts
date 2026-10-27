import { Hono } from "hono";

import { findSignedIn, getSessionCookie, publicApiRateLimit, setSessionCookie } from "@/server/middlewares/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";

export default new Hono().post("/start", publicApiRateLimit, async (c) => {
  const signedIn = await findSignedIn(getSessionCookie(c));
  const { session, user, reused } = await AuthenticationService.startDemo(signedIn);
  if (!reused) setSessionCookie(c, session.id);
  return c.json(user, reused ? 200 : 201);
});
