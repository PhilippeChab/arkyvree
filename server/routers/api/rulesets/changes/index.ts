import { Hono } from "hono";
import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";

/** An entity a fork restores to its parent's: of a kind its rules write (`Engine.rules().restorableKinds()`). */
const restorableEntityParams = idParam.extend({
  entityType: z.enum(Engine.rules().restorableKinds()),
  entityId: z.string().uuid(),
});

export default new Hono<SessionContext>()
  .get("/:id/changes", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetChangesService.getChanges(c.var.requestSession, id), 200);
  })
  .post("/:id/entities/:entityType/:entityId/restore", validate("param", restorableEntityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await RulesetChangesService.revertOverride(c.var.requestSession, id, entityType, entityId), 200);
  });
