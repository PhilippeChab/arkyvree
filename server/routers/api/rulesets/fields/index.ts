import { Hono } from "hono";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { RulesetFieldsService } from "@/server/services/rulesets/fields/index.ts";

export default new Hono<SessionContext>().get("/:id/fields", validate("param", idParam), async (c) => {
  const { id } = c.req.valid("param");
  return c.json(await RulesetFieldsService.getFields(id), 200);
});
