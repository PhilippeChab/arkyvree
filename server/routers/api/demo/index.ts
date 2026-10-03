import { Hono } from "hono";

import { getSessionCookie, publicApiRateLimit, setSessionCookie } from "@/server/middlewares/index.ts";
import { AuthenticationService } from "@/server/services/index.ts";

export default new Hono().post("/start", publicApiRateLimit, async (c) => {
  const existingSessionId = getSessionCookie(c);
  const { session, user, reused } = await AuthenticationService.startDemo(existingSessionId);
  if (!reused) setSessionCookie(c, session.id);
  return c.json(user, reused ? 200 : 201);
});
