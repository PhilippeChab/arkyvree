import { Hono } from "hono";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { v1Modifiers, v1Requirements } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizableParams, requirementOwnerParams } from "@/server/routers/v1/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";

/** An entity's customizations: what it changes of a character that has it, and what a character needs to take it. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/:kind/:entityId/modifiers",
    describeRoute({
      response: v1Modifiers,
      status: 200,
      summary: "An entity's modifiers (a class's, a class level's, a feat's, an item's, a race's, a spell's)",
    }),
    validate("param", customizableParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      return c.json((await ModifiersService.getModifiers(id, kind, entityId)).map(V1.modifier), 200);
    },
  )
  .get(
    "/:id/:kind/:entityId/requirements",
    describeRoute({
      response: v1Requirements,
      status: 200,
      summary: "An entity's requirements (a modifier's too), its groups and checks by place in the tree",
    }),
    validate("param", requirementOwnerParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      return c.json((await RequirementsService.getRequirements(id, kind, entityId)).map(V1.requirement), 200);
    },
  );
