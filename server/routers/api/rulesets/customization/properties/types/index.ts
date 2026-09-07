import { toJson } from "@/server/errors/index.ts";
import { limit, page } from "@/server/routers/api/validation.ts";
import { PropertyTypesService } from "@/server/services/rulesets/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const idParam = z.object({ id: z.string().uuid() });

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
        entityType: z.enum(["feats", "klasses", "klass_levels", "items", "powers", "races", "rulesets", "skills"]).optional(),
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { entityType } = c.req.valid("query");
      const service = PropertyTypesService.initialize();
      const result = await service.call("getPropertyTypes", rulesetId, entityType);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
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
        entityType: z.enum(["feats", "klasses", "klass_levels", "items", "powers", "races", "rulesets", "skills"]).optional(),
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { query, entityType } = c.req.valid("query");
      const service = PropertyTypesService.initialize();
      const result = await service.call("searchPropertyTypes", rulesetId, query, entityType);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
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
        entityType: z.enum(["feats", "klasses", "klass_levels", "items", "powers", "races", "rulesets", "skills"]).optional(),
        limit,
        page,
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { query, entityType, limit: limitValue, page: pageValue } = c.req.valid("query");
      const service = PropertyTypesService.initialize();
      const result = await service.call(
        "getCompletions",
        rulesetId,
        query,
        { limit: limitValue, page: pageValue },
        entityType,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
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
      const service = PropertyTypesService.initialize();
      const result = await service.call(
        "getValueCompletions",
        rulesetId,
        type,
        query,
        { limit: limitValue, page: pageValue },
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );

export default propertyTypes;