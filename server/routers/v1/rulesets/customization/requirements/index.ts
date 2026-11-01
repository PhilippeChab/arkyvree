import { Hono } from "hono";
import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { chainingOperator, requirementOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { v1LabeledRequirements } from "@/server/routers/v1/schemas/entities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizedParams } from "@/server/routers/v1/validation.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";

/** What a requirement's body says: where it sits, and what it checks, or how a group chains its own. */
const requirementFields = {
  chainingOperator: chainingOperator.optional().meta({ description: "A group's `and` or `or`" }),
  level: z.string().min(1).meta({ description: "Where it sits in its tree of groups" }),
  operator: requirementOperator.optional(),
  target: z.string().optional().meta({ description: "The target path it checks" }),
  value: z.string().optional(),
  valueType: z.string().optional(),
};

/** A requirement's owner: an entity of a customized kind, or a modifier, whose requirements say when it applies. */
const requirementOwnerParams = customizedParams.extend({
  kind: z
    .enum([...Engine.storage().customizableKinds(), "modifiers"])
    .meta({ description: "The owner's kind: one of the rules' `customizable` kinds, or `modifiers` for a modifier's" }),
});

const requirementParams = requirementOwnerParams.extend({ requirementId: z.string().uuid() });

/** An entity's requirements and their groups, each with its target's labels and its value's. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/customization/:kind/:entityId/requirements",
    describeRoute({
      response: v1LabeledRequirements,
      status: 200,
      summary: "An entity's requirements and their groups, each with its target's labels and its value's",
    }),
    validate("param", requirementOwnerParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const requirements = await RequirementsService.getRequirements(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledRequirements(requirements), 200);
    },
  )
  .post(
    "/:id/customization/:kind/:entityId/requirements",
    describeRoute({
      response: v1LabeledRequirements,
      status: 201,
      summary: "Adds a requirement, or a group of them, to an entity, answering its requirements",
    }),
    validate("param", requirementOwnerParams),
    validate("json", z.object(requirementFields)),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      await RequirementsService.createRequirement(c.var.requestSession, id, kind, entityId, body);
      const requirements = await RequirementsService.getRequirements(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledRequirements(requirements), 201);
    },
  )
  .put(
    "/:id/customization/:kind/:entityId/requirements/:requirementId",
    describeRoute({ response: v1LabeledRequirements, status: 200, summary: "Updates an entity's requirement" }),
    validate("param", requirementParams),
    validate(
      "json",
      z.object({
        ...requirementFields,
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { entityId, id, kind, requirementId } = c.req.valid("param");
      const body = c.req.valid("json");
      await RequirementsService.updateRequirement(c.var.requestSession, id, kind, entityId, requirementId, body);
      const requirements = await RequirementsService.getRequirements(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledRequirements(requirements), 200);
    },
  )
  .delete(
    "/:id/customization/:kind/:entityId/requirements/:requirementId",
    describeRoute({ response: null, status: 204, summary: "Removes an entity's requirement, or a group of them" }),
    validate("param", requirementParams),
    async (c) => {
      const { entityId, id, kind, requirementId } = c.req.valid("param");
      await RequirementsService.deleteRequirement(c.var.requestSession, id, kind, entityId, requirementId);
      return c.body(null, 204);
    },
  );
