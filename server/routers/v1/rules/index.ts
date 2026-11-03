import { Hono } from "hono";

import { type ApiKeyContext, describeRoute } from "@/server/middlewares/index.ts";
import { v1Rules } from "@/server/routers/v1/schemas/rules.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesService } from "@/server/services/rules/index.ts";

/**
 * What each base rules' rulesets are made of: the names other answers key by (an entity's kinds and fields, a
 * progression's values, a list's tiers), which a caller reads here rather than knowing any one game's.
 */
export default new Hono<ApiKeyContext>().get(
  "/",
  describeRoute({
    response: v1Rules,
    status: 200,
    summary: "What each base rules' rulesets are made of: their entity kinds, fields, tiers and progression's keys",
  }),
  (c) => c.json(V1.rules(RulesService.getRules()), 200),
);
