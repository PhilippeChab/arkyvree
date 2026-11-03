import { Hono } from "hono";
import { z } from "zod";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam, sanitizedText } from "@/server/routers/api/validation.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { MAX_API_KEY_LIFETIME_IN_DAYS, MAX_API_KEY_NAME_LENGTH } from "@/shared/apiKeys.ts";

/** The user's API keys, which act as them on the public API: listed, made and revoked. A demo account has none of these. */
export default new Hono<SessionContext>()
  .get("/api-keys", denyDemoUser, async (c) => c.json(await ApiKeysService.getKeys(c.var.requestSession), 200))
  .post(
    "/api-keys",
    denyDemoUser,
    validate(
      "json",
      z.object({
        // Its lifetime in days, or none: a key that never expires
        expiresInDays: z.number().int().min(1).max(MAX_API_KEY_LIFETIME_IN_DAYS).nullable(),
        name: sanitizedText.min(1).max(MAX_API_KEY_NAME_LENGTH),
      }),
    ),
    async (c) => {
      const { expiresInDays, name } = c.req.valid("json");
      return c.json(await ApiKeysService.createKey(c.var.requestSession, name, expiresInDays), 201);
    },
  )
  .delete("/api-keys/:id", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await ApiKeysService.revokeKey(c.var.requestSession, id), 200);
  });
