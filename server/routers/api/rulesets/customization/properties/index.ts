import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import propertyTypesRouter from "@/server/routers/api/rulesets/customization/properties/types/index.ts";
import { respond } from "@/server/routers/respond.ts";
import { PropertiesService } from "@/server/services/rulesets/index.ts";

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
      const result = await propertiesService.call("getEntityProperties", id, entityType, entityId);
      return respond(c, result, 200);
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
      return respond(c, result, 201);
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
      return respond(c, result, 200);
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
      return respond(c, result, 200);
    },
  );
