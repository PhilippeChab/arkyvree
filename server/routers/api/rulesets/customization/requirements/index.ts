import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import {
  chainingOperator,
  ownerParams,
  requirementOperator,
} from "@/server/routers/api/rulesets/customization/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { RequirementsService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/customization/:entityType/:entityId/requirements", zValidator("param", ownerParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");

    const requirementsService = RequirementsService.initialize();
    const result = await requirementsService.call("getEntityRequirements", id, entityType, entityId);
    return respond(c, result, 200);
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

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "createEntityRequirement",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        body,
      );
      return respond(c, result, 201);
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

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "updateEntityRequirement",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        requirementId,
        body,
      );
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/requirements/:requirementId",
    zValidator("param", ownerParams.extend({ requirementId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId, requirementId } = c.req.valid("param");

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "deleteEntityRequirement",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        requirementId,
      );
      return respond(c, result, 200);
    },
  );
