import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import { buildEntityTypeSchema } from "@/server/routers/api/schemaBuilders.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { PropertyTypesService } from "@/server/services/rulesets/customization/properties/types/index.ts";
import { PROPERTY_ENTITY_TYPES } from "@/shared/customization/entities.ts";

const propertyTypes = new Hono()
  /**
   * GET /api/rulesets/:id/customization/properties/types?entityType=items
   * Get all available property types (static + custom)
   */
  .get(
    "/:id/customization/properties/types",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        entityType: buildEntityTypeSchema(PROPERTY_ENTITY_TYPES).optional(),
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { entityType } = c.req.valid("query");
      return c.json(await PropertyTypesService.getPropertyTypes(rulesetId, entityType), 200);
    },
  )
  /**
   * GET /api/rulesets/:id/customization/properties/types/completions?query=weapon&entityType=items&limit=10&page=1
   * Get property type completions for autocomplete
   */
  .get(
    "/:id/customization/properties/types/completions",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        query: z.string().default(""),
        entityType: buildEntityTypeSchema(PROPERTY_ENTITY_TYPES).optional(),
        limit,
        page,
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { query, entityType, limit: limitValue, page: pageValue } = c.req.valid("query");
      return c.json(
        await PropertyTypesService.getCompletions(rulesetId, query, { limit: limitValue, page: pageValue }, entityType),
        200,
      );
    },
  )
  /**
   * GET /api/rulesets/:id/customization/properties/types/search?query=weapon&entityType=items
   * Search property types by query
   */
  .get(
    "/:id/customization/properties/types/search",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        query: z.string().min(1),
        entityType: buildEntityTypeSchema(PROPERTY_ENTITY_TYPES).optional(),
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { query, entityType } = c.req.valid("query");
      return c.json(await PropertyTypesService.getMatchingPropertyTypes(rulesetId, query, entityType), 200);
    },
  )
  /**
   * GET /api/rulesets/:id/customization/properties/values/completions?type=WEAPON_PROFICIENCY&query=Mar&limit=10&page=1
   * Get property value completions for autocomplete
   */
  .get(
    "/:id/customization/properties/values/completions",
    zValidator("param", idParam),
    zValidator(
      "query",
      z.object({
        type: z.string().min(1),
        query: z.string().default(""),
        limit,
        page,
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { type, query, limit: limitValue, page: pageValue } = c.req.valid("query");
      return c.json(
        await PropertyTypesService.getValueCompletions(rulesetId, type, query, {
          limit: limitValue,
          page: pageValue,
        }),
        200,
      );
    },
  );

export default propertyTypes;
