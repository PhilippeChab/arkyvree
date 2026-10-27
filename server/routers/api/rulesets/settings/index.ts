import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityFields, entityLinks, idParam } from "@/server/routers/api/validation.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/settings", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetSettingsService.getSettings(c.var.requestSession, id), 200);
  })
  .put(
    "/:id/settings",
    validate("param", idParam),
    validate("json", z.strictObject({ fields: entityFields.optional(), links: entityLinks.optional() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RulesetSettingsService.updateSettings(c.var.requestSession, id, body), 200);
    },
  );
