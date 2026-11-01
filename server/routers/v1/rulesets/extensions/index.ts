import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1RulesetExtensions } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";

/** The extensions a ruleset is subscribed to. */
export default new Hono<ApiKeyContext>().get(
  "/:id/extensions",
  describeRoute({ response: v1RulesetExtensions, status: 200, summary: "The extensions a ruleset is subscribed to" }),
  validate("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(c.var.requestSession, id)), 200);
  },
);
