import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { modifierOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { ModifiersService } from "@/server/services/rulesets/index.ts";
import { CUSTOMIZABLE_ENTITY_TYPES, CUSTOMIZATION_OWNER_TYPES } from "@/shared/customization/entities.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZATION_OWNER_TYPES),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call("getEntityModifier", id, entityType, entityId, modifierId);
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/customization/:entityType/:entityId/modifiers",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call("getEntityModifiers", id, entityType, entityId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
      }),
    ),
    zValidator(
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

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call(
        "createEntityModifier",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        body,
      );
      return respond(c, result, 201);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId/duplicate",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    zValidator(
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

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call(
        "duplicateEntityModifier",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        modifierId,
        body,
      );
      return respond(c, result, 201);
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    zValidator(
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

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call(
        "updateEntityModifier",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        modifierId,
        body,
      );
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(CUSTOMIZABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call(
        "deleteEntityModifier",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        modifierId,
      );
      return respond(c, result, 200);
    },
  );
