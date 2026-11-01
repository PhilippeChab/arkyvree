import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1RulesetSettings } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";

/** A ruleset's settings: its own fields and links. */
export default new Hono<ApiKeyContext>().get(
  "/:id/settings",
  describeRoute({ response: v1RulesetSettings, status: 200, summary: "A ruleset's settings" }),
  validate("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(V1.rulesetSettings(await RulesetSettingsService.getSettings(c.var.requestSession, id)), 200);
  },
);
