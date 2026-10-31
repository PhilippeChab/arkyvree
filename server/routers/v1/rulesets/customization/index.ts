import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { v1LabeledModifiers, v1LabeledRequirements } from "@/server/routers/v1/schemas/entities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizedParams } from "@/server/routers/v1/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";

/** An entity's customizations, as its ruleset's editors read them: its modifiers and its requirements, labeled. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/customization/:kind/:entityId/modifiers",
    describeRoute({
      response: v1LabeledModifiers,
      status: 200,
      summary: "An entity's modifiers, each with its target's labels and its value's",
    }),
    validate("param", customizedParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const modifiers = await ModifiersService.getModifiers(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledModifiers(modifiers), 200);
    },
  )
  .get(
    "/:id/customization/:kind/:entityId/requirements",
    describeRoute({
      response: v1LabeledRequirements,
      status: 200,
      summary: "An entity's requirements and their groups, each with its target's labels and its value's",
    }),
    validate("param", customizedParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const requirements = await RequirementsService.getRequirements(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledRequirements(requirements), 200);
    },
  );
