import { Hono } from "hono";

import { toJson } from "@/server/errors/index.ts";
import { getSessionCookie, publicApiRateLimit, setSessionCookie } from "@/server/middlewares/index.ts";
import { AuthenticationService } from "@/server/services/index.ts";

export default new Hono()
  .post("/start", publicApiRateLimit, async (c) => {
    const existingSessionId = getSessionCookie(c);
    const result = await AuthenticationService.initialize().call(
      "startDemo",
      existingSessionId,
    );
    if (!result[0]) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }

    const { session, user, reused } = result[1];
    if (!reused) setSessionCookie(c, session.id);
    return c.json(user, reused ? 200 : 201);
  });
