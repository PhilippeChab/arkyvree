import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";

export default new Hono<SessionContext>()
  .post(
    "/:id/entities/:entityType/:entityId/restore",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum([
          "saves",
          "skills",
          "feats",
          "powers",
          "items",
          "races",
          "languages",
          "klasses",
          "aptitudes",
          "mechanics",
        ]),
        entityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      return c.json(await RulesetChangesService.revertOverride(c.var.requestSession, id, entityType, entityId), 200);
    },
  )
  .get("/:id/changes", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetChangesService.getChanges(c.var.requestSession, id), 200);
  });
