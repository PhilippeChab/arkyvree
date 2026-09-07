import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import propertyTypesRouter from "@/server/routers/api/rulesets/customization/properties/types/index.ts";
import { PropertiesService } from "@/server/services/rulesets/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/customization/:entityType/:entityId/properties",
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

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "getEntityProperties",
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
  .route("/", propertyTypesRouter)
  .post(
    "/:id/customization/:entityType/:entityId/properties",
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
        value: z.string().min(1),
        type: z.string().min(1),
        description: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");
      const body = c.req.valid("json");

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "createEntityProperty",
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
    "/:id/customization/:entityType/:entityId/properties/:property_id",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
        property_id: z.string().uuid(),
      }),
    ),
    zValidator(
      "json",
      z.object({
        value: z.string().min(1),
        type: z.string().min(1),
        description: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, property_id } = c.req.valid("param");
      const body = c.req.valid("json");

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "updateEntityProperty",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        property_id,
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
    "/:id/customization/:entityType/:entityId/properties/:property_id",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        entityType: z.enum(["klass_levels", "klasses", "feats", "items", "powers", "races"]),
        entityId: z.string().uuid(),
        property_id: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, entityType, entityId, property_id } = c.req.valid("param");

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "deleteEntityProperty",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        property_id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
