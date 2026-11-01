import { Hono } from "hono";
import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1RulesetChanges } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";

/** A fork's entity it restores to its parent's, by the parent's id: of a kind the rules restore. */
const restorableParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.rules().restorableKinds())
    .meta({ description: "The entity's kind, one the `kinds` of `GET /v1/rules` lists that isn't `readOnly`" }),
});

/** What a fork changed of the ruleset it's forked from. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/changes",
    describeRoute({
      response: v1RulesetChanges,
      status: 200,
      summary: "What a fork changed of the ruleset it's forked from: the entities it added, changed and deleted",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.rulesetChanges(await RulesetChangesService.getChanges(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/entities/:kind/:entityId/restore",
    describeRoute({
      response: v1RulesetChanges,
      status: 200,
      summary: "Restores a fork's entity to its parent's, answering the fork's changes left",
    }),
    validate("param", restorableParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      await RulesetChangesService.revertOverride(c.var.requestSession, id, kind, entityId);
      return c.json(V1.rulesetChanges(await RulesetChangesService.getChanges(c.var.requestSession, id)), 200);
    },
  );
