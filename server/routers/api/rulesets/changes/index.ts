import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { buildEntityTypeSchema, idParam } from "@/server/routers/api/validation.ts";
import { RESTORABLE_ENTITY_TYPES, RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/changes", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetChangesService.getChanges(c.var.requestSession, id), 200);
  })
  .post(
    "/:id/entities/:entityType/:entityId/restore",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: buildEntityTypeSchema(RESTORABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      return c.json(await RulesetChangesService.revertOverride(c.var.requestSession, id, entityType, entityId), 200);
    },
  );
