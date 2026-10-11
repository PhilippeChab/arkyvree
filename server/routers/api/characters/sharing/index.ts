import { Hono } from "hono";

import { denyDemoUser, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";

export default new Hono<SessionContext>()
  .post("/:id/share", denyDemoUser, validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    return c.json(await CharacterSharingService.generateShareToken(c.var.requestSession, id), 200);
  })
  .delete("/:id/share", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");

    return c.json(await CharacterSharingService.revokeShareToken(c.var.requestSession, id), 200);
  });
