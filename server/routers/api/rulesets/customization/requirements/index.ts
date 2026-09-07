import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { RequirementsService } from "@/server/services/rulesets/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/customization/:entityType/:entityId/requirements",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races", "modifiers"]),
        entityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "getEntityRequirements",
        id,
        entityType,
        entityId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/requirements",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races", "modifiers"]),
        entityId: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        level: z.string().min(1),
        target: z.string().optional(),
        value: z.string().optional(),
        valueType: z.string().optional(),
        operator: z.string().optional(),
        chainingOperator: z.string().optional(),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/requirements/:requirement_id",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races", "modifiers"]),
        entityId: z.string().uuid(),
        requirement_id: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        level: z.string().min(1),
        target: z.string().optional(),
        value: z.string().optional(),
        valueType: z.string().optional(),
        operator: z.string().optional(),
        chainingOperator: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, requirement_id } = c.req.valid("param");
      const body = c.req.valid("json");

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "updateEntityRequirement",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        requirement_id,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/requirements/:requirement_id",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races", "modifiers"]),
        entityId: z.string().uuid(),
        requirement_id: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, requirement_id } = c.req.valid("param");

      const requirementsService = RequirementsService.initialize();
      const result = await requirementsService.call(
        "deleteEntityRequirement",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        requirement_id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
