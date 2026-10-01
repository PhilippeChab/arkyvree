import { Hono } from "hono";

import { getSessionCookie, publicApiRateLimit, setSessionCookie } from "@/server/middlewares/index.ts";
import { errorResponse } from "@/server/routers/respond.ts";
import { AuthenticationService } from "@/server/services/index.ts";

export default new Hono().post("/start", publicApiRateLimit, async (c) => {
  const existingSessionId = getSessionCookie(c);
  const result = await AuthenticationService.initialize().call("startDemo", existingSessionId);
  if (!result[0]) return errorResponse(c, result[2]);

  const { session, user, reused } = result[1];
  if (!reused) setSessionCookie(c, session.id);
  return c.json(user, reused ? 200 : 201);
});
