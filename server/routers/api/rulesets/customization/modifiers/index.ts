import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { ModifiersService } from "@/server/services/rulesets/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races", "modifiers"]),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, modifierId } = c.req.valid("param");

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call(
        "getEntityModifier",
        id,
        entityType,
        entityId,
        modifierId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/customization/:entityType/:entityId/modifiers",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");

      const modifiersService = ModifiersService.initialize();
      const result = await modifiersService.call("getEntityModifiers", id, entityType, entityId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: z.string().min(1),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .post(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId/duplicate",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: z.string().min(1),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
        modifierId: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        target: z.string().min(1),
        value: z.string().min(1),
        operator: z.string().min(1),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/modifiers/:modifierId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
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
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
