import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { v1LabeledModifiers } from "@/server/routers/v1/schemas/entities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizedParams, modifierFields } from "@/server/routers/v1/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";

const modifierParams = customizedParams.extend({ modifierId: z.string().uuid() });

/** An entity's modifiers, as its ruleset's editors read them: each with its target's labels and its value's. */
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
  .post(
    "/:id/customization/:kind/:entityId/modifiers",
    describeRoute({
      response: v1LabeledModifiers,
      status: 201,
      summary: "Adds a modifier to an entity, answering its modifiers",
    }),
    validate("param", customizedParams),
    validate("json", z.object(modifierFields)),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      const body = c.req.valid("json");
      await ModifiersService.createModifier(c.var.requestSession, id, kind, entityId, body);
      const modifiers = await ModifiersService.getModifiers(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledModifiers(modifiers), 201);
    },
  )
  .put(
    "/:id/customization/:kind/:entityId/modifiers/:modifierId",
    describeRoute({ response: v1LabeledModifiers, status: 200, summary: "Updates an entity's modifier" }),
    validate("param", modifierParams),
    validate(
      "json",
      z.object({
        ...modifierFields,
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { entityId, id, kind, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      await ModifiersService.updateModifier(c.var.requestSession, id, kind, entityId, modifierId, body);
      const modifiers = await ModifiersService.getModifiers(c.var.requestSession, id, kind, entityId);
      return c.json(V1.labeledModifiers(modifiers), 200);
    },
  )
  .delete(
    "/:id/customization/:kind/:entityId/modifiers/:modifierId",
    describeRoute({ response: null, status: 204, summary: "Removes an entity's modifier" }),
    validate("param", modifierParams),
    async (c) => {
      const { entityId, id, kind, modifierId } = c.req.valid("param");
      await ModifiersService.deleteModifier(c.var.requestSession, id, kind, entityId, modifierId);
      return c.body(null, 204);
    },
  );
