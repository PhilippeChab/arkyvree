import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import {
  chainingOperator,
  ownerParams,
  requirementOperator,
} from "@/server/routers/api/rulesets/customization/validation.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/customization/:entityType/:entityId/requirements", zValidator("param", ownerParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await RequirementsService.getEntityRequirements(id, entityType, entityId), 200);
  })
  .post(
    "/:id/customization/:entityType/:entityId/requirements",
    zValidator("param", ownerParams),
    zValidator(
      "json",
      z.object({
        level: z.string().min(1),
        target: z.string().optional(),
        value: z.string().optional(),
        valueType: z.string().optional(),
        operator: requirementOperator.optional(),
        chainingOperator: chainingOperator.optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await RequirementsService.createEntityRequirement(c.var.requestSession, id, entityType, entityId, body),
        201,
      );
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/requirements/:requirementId",
    zValidator("param", ownerParams.extend({ requirementId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        level: z.string().min(1),
        target: z.string().optional(),
        value: z.string().optional(),
        valueType: z.string().optional(),
        operator: requirementOperator.optional(),
        chainingOperator: chainingOperator.optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, requirementId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await RequirementsService.updateEntityRequirement(
          c.var.requestSession,
          id,
          entityType,
          entityId,
          requirementId,
          body,
        ),
        200,
      );
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/requirements/:requirementId",
    zValidator("param", ownerParams.extend({ requirementId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId, requirementId } = c.req.valid("param");
      return c.json(
        await RequirementsService.deleteEntityRequirement(
          c.var.requestSession,
          id,
          entityType,
          entityId,
          requirementId,
        ),
        200,
      );
    },
  );
