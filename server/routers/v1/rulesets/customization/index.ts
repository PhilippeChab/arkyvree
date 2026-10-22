import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { v1Modifier, v1Modifiers, v1Requirement, v1Requirements } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import {
  customizableParams,
  modifierOperator,
  modifierTarget,
  modifierValue,
  requirementOwnerParams,
} from "@/server/routers/v1/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { CHAINING_OPERATORS, REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";

/** A modifier, its create's, its duplicate's and its update's. */
const modifierBody = z.object({ operator: modifierOperator, target: modifierTarget, value: modifierValue });

const modifierParams = customizableParams.extend({ modifierId: z.string().uuid() });

/** A requirement, its create's and its update's: a group's (`chainingOperator`), or a check's. */
const requirementBody = z.object({
  chainingOperator: z.enum(CHAINING_OPERATORS).optional().meta({ description: "A group's: `and`, or `or`" }),
  group: z.string().min(1).meta({ description: "Its place in the tree: `1` the root group, `1.2` its second" }),
  operator: z.enum(REQUIREMENT_OPERATORS).optional(),
  target: z.string().optional().meta({ description: "The path it checks (`GET /v1/rulesets/{id}/target-paths`)" }),
  value: z.string().optional(),
});

const requirementParams = requirementOwnerParams.extend({ requirementId: z.string().uuid() });

/**
 * An entity's customizations: what it changes of a character that has it (its modifiers), and what a character needs
 * to take it (its requirement tree). An inherited entity's are changed on a copy of its own, as the app changes them.
 */
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
  )
  .post(
    "/:id/:kind/:entityId/modifiers",
    describeRoute({ response: v1Modifier, status: 201, summary: "Adds a modifier to an entity" }),
    validate("param", customizableParams),
    validate("json", modifierBody),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await ModifiersService.createModifier(c.var.requestSession, id, kind, entityId, body);
      const modifier = await ModifiersService.getModifier(id, kind, created.resolvedEntityId, created.id);
      return c.json(V1.modifier(modifier), 201);
    },
  )
  .post(
    "/:id/:kind/:entityId/modifiers/:modifierId/duplicate",
    describeRoute({
      response: v1Modifier,
      status: 201,
      summary: "Adds a copy of a modifier to its entity, with its requirements, changed as the body says",
    }),
    validate("param", modifierParams),
    validate("json", modifierBody),
    async (c) => {
      const { entityId, id, kind, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const created = await ModifiersService.duplicateModifier(session, id, kind, entityId, modifierId, body);
      const modifier = await ModifiersService.getModifier(id, kind, created.resolvedEntityId, created.id);
      return c.json(V1.modifier(modifier), 201);
    },
  )
  .post(
    "/:id/:kind/:entityId/requirements",
    describeRoute({ response: v1Requirement, status: 201, summary: "Adds a requirement to an entity's tree" }),
    validate("param", requirementOwnerParams),
    validate("json", requirementBody),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const created = await RequirementsService.createRequirement(
        session,
        id,
        kind,
        entityId,
        V1.requirementRequest(body),
      );
      const requirements = await RequirementsService.getRequirements(id, kind, created.resolvedEntityId);
      return c.json(V1.written(requirements, created.id, V1.requirement), 201);
    },
  )
  .put(
    "/:id/:kind/:entityId/modifiers/:modifierId",
    describeRoute({ response: v1Modifier, status: 200, summary: "Changes a modifier of an entity's" }),
    validate("param", modifierParams),
    validate("json", modifierBody),
    async (c) => {
      const { entityId, id, kind, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      const session = c.var.requestSession;
      const updated = await ModifiersService.updateModifier(session, id, kind, entityId, modifierId, body);
      const modifier = await ModifiersService.getModifier(id, kind, updated.resolvedEntityId, updated.id);
      return c.json(V1.modifier(modifier), 200);
    },
  )
  .put(
    "/:id/:kind/:entityId/requirements/:requirementId",
    describeRoute({ response: v1Requirement, status: 200, summary: "Changes a requirement of an entity's tree" }),
    validate("param", requirementParams),
    validate("json", requirementBody),
    async (c) => {
      const { entityId, id, kind, requirementId } = c.req.valid("param");
      const body = c.req.valid("json");
      // A check's update keeps the target its body leaves out, as its value and operator: without one it'd be a group's
      const stored = (await RequirementsService.getRequirements(id, kind, entityId)).find(
        (r) => r.id === requirementId,
      );
      const target = body.target ?? stored?.target ?? undefined;
      const updated = await RequirementsService.updateRequirement(
        c.var.requestSession,
        id,
        kind,
        entityId,
        requirementId,
        V1.requirementRequest({ ...body, target }),
      );
      const requirements = await RequirementsService.getRequirements(id, kind, updated.resolvedEntityId);
      return c.json(V1.written(requirements, updated.id, V1.requirement), 200);
    },
  )
  .delete(
    "/:id/:kind/:entityId/modifiers/:modifierId",
    describeRoute({ response: null, status: 204, summary: "Deletes a modifier of an entity's" }),
    validate("param", modifierParams),
    async (c) => {
      const { entityId, id, kind, modifierId } = c.req.valid("param");
      await ModifiersService.deleteModifier(c.var.requestSession, id, kind, entityId, modifierId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/:kind/:entityId/requirements/:requirementId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Deletes a requirement of an entity's tree: a group's, or a check's",
    }),
    validate("param", requirementParams),
    async (c) => {
      const { entityId, id, kind, requirementId } = c.req.valid("param");
      await RequirementsService.deleteRequirement(c.var.requestSession, id, kind, entityId, requirementId);
      return c.body(null, 204);
    },
  );
