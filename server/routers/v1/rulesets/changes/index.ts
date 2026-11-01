import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1RulesetChanges } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";

/** What a fork changed of the ruleset it's forked from. */
export default new Hono<ApiKeyContext>().get(
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
);
