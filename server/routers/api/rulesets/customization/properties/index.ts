import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import propertyTypesRouter from "@/server/routers/api/rulesets/customization/properties/types/index.ts";
import { entityParams } from "@/server/routers/api/rulesets/customization/validation.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";

const propertyParams = entityParams.extend({ propertyId: z.string().uuid() });

export default new Hono<SessionContext>()
  .route("/", propertyTypesRouter)
  .get("/:id/customization/:entityType/:entityId/properties", zValidator("param", entityParams), async (c) => {
    const { id, entityType, entityId } = c.req.valid("param");
    return c.json(await PropertiesService.getProperties(id, entityType, entityId), 200);
  })
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
      return c.json(await PropertiesService.createProperty(c.var.requestSession, id, entityType, entityId, body), 201);
    },
  )
  .put(
    "/:id/customization/:entityType/:entityId/properties/:propertyId",
    zValidator("param", propertyParams),
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
      return c.json(
        await PropertiesService.updateProperty(c.var.requestSession, id, entityType, entityId, propertyId, body),
        200,
      );
    },
  )
  .delete(
    "/:id/customization/:entityType/:entityId/properties/:propertyId",
    zValidator("param", propertyParams),
    async (c) => {
      const { id, entityType, entityId, propertyId } = c.req.valid("param");
      return c.json(
        await PropertiesService.deleteProperty(c.var.requestSession, id, entityType, entityId, propertyId),
        200,
      );
    },
  );
