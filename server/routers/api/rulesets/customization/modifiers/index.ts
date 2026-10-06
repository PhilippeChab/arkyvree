import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityParams, modifierOperator, ownerParams } from "@/server/routers/api/rulesets/customization/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";

const modifierParams = entityParams.extend({ modifierId: z.string().uuid() });
const ownerModifierParams = ownerParams.extend({ modifierId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/:id/customization/:entityType/:entityId/modifiers", validate("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await ModifiersService.getModifiers(id, entityType, entityId), 200);
  })
  .get(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    validate("param", ownerModifierParams),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      return c.json(await ModifiersService.getModifier(id, entityType, entityId, modifierId), 200);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers",
    validate("param", entityParams),
    validate(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: modifierOperator,
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ModifiersService.createModifier(c.var.requestSession, id, entityType, entityId, body), 201);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId/duplicate",
    validate("param", modifierParams),
    validate(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: modifierOperator,
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await ModifiersService.duplicateModifier(c.var.requestSession, id, entityType, entityId, modifierId, body),
        201,
      );
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    validate("param", modifierParams),
    validate(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: modifierOperator,
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await ModifiersService.updateModifier(c.var.requestSession, id, entityType, entityId, modifierId, body),
        200,
      );
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    validate("param", modifierParams),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      return c.json(
        await ModifiersService.deleteModifier(c.var.requestSession, id, entityType, entityId, modifierId),
        200,
      );
    },
  );
