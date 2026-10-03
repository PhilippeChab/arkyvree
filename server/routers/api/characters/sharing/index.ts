import { Hono } from "hono";

import { denyDemoUser, type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

export default new Hono<SessionContext>()
  // Generate share token
  .post("/:id/share", denyDemoUser, zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    return c.json(await CharacterSharingService.generateShareToken(c.var.requestSession, id), 200);
  })
  // Revoke share token
  .delete("/:id/share", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    return c.json(await CharacterSharingService.revokeShareToken(c.var.requestSession, id), 200);
  });
