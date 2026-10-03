import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import propertyTypesRouter from "@/server/routers/api/rulesets/customization/properties/types/index.ts";
import { entityParams } from "@/server/routers/api/rulesets/customization/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { PropertiesService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/customization/:entityType/:entityId/properties", zValidator("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");

    const propertiesService = PropertiesService.initialize();
    const result = await propertiesService.call("getEntityProperties", id, entityType, entityId);
    return respond(c, result, 200);
  })
  .route("/", propertyTypesRouter)
  .post(
    "/:id/customization/:entityType/:entityId/properties",
    zValidator("param", entityParams),
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
    "/:id/customization/:entityType/:entityId/properties/:propertyId",
    zValidator("param", entityParams.extend({ propertyId: z.string().uuid() })),
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
      const { id, entityType, entityId, propertyId } = c.req.valid("param");
      const body = c.req.valid("json");

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "updateEntityProperty",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        propertyId,
        body,
      );
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/properties/:propertyId",
    zValidator("param", entityParams.extend({ propertyId: z.string().uuid() })),
    async (c) => {
      const { id, entityType, entityId, propertyId } = c.req.valid("param");

      const propertiesService = PropertiesService.initialize();
      const result = await propertiesService.call(
        "deleteEntityProperty",
        c.var.requestSession,
        id,
        entityType,
        entityId,
        propertyId,
      );
      return respond(c, result, 200);
    },
  );
