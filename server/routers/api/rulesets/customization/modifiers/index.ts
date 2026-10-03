import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { entityParams, modifierOperator, ownerParams } from "@/server/routers/api/rulesets/customization/validation.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator("param", ownerParams.extend({ modifierId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      return c.json(await ModifiersService.getEntityModifier(id, entityType, entityId, modifierId), 200);
    },
  )
  .get("/:id/customization/:entityType/:entityId/modifiers", zValidator("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await ModifiersService.getEntityModifiers(id, entityType, entityId), 200);
  })
  .post(
    "/:id/customization/:entityType/:entityId/modifiers",
    zValidator("param", entityParams),
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
      return c.json(
        await ModifiersService.createEntityModifier(c.var.requestSession, id, entityType, entityId, body),
        201,
      );
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId/duplicate",
    zValidator("param", entityParams.extend({ modifierId: z.string().uuid() })),
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
      return c.json(
        await ModifiersService.duplicateEntityModifier(
          c.var.requestSession,
          id,
          entityType,
          entityId,
          modifierId,
          body,
        ),
        201,
      );
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator("param", entityParams.extend({ modifierId: z.string().uuid() })),
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
      return c.json(
        await ModifiersService.updateEntityModifier(c.var.requestSession, id, entityType, entityId, modifierId, body),
        200,
      );
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator("param", entityParams.extend({ modifierId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");
      return c.json(
        await ModifiersService.deleteEntityModifier(c.var.requestSession, id, entityType, entityId, modifierId),
        200,
      );
    },
  );
