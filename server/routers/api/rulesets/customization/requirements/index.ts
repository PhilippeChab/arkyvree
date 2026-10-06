import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import {
  chainingOperator,
  ownerParams,
  requirementOperator,
} from "@/server/routers/api/rulesets/customization/validation.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";

const requirementParams = ownerParams.extend({ requirementId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/:id/customization/:entityType/:entityId/requirements", validate("param", ownerParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await RequirementsService.getRequirements(id, entityType, entityId), 200);
  })
  .post(
    "/:id/customization/:entityType/:entityId/requirements",
    validate("param", ownerParams),
    validate(
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
        await RequirementsService.createRequirement(c.var.requestSession, id, entityType, entityId, body),
        201,
      );
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/requirements/:requirementId",
    validate("param", requirementParams),
    validate(
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
        await RequirementsService.updateRequirement(
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
    validate("param", requirementParams),
    async (c) => {
      const { id, entityType, entityId, requirementId } = c.req.valid("param");
      return c.json(
        await RequirementsService.deleteRequirement(c.var.requestSession, id, entityType, entityId, requirementId),
        200,
      );
    },
  );
