import { toJson } from "@/server/errors/index.ts";
import { TargetPathsService } from "@/server/services/rulesets/index.ts";
import { limit, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const idParam = z.object({ id: z.string().uuid() });

const targetPaths = new Hono()
  /**
   * POST /api/rulesets/:id/customization/target/paths/validate
   * Validate a target path like a language server
   */
  .post(
    "/:id/customization/target/paths/validate",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        path: z.string(),
        kind: z.enum(["modifier", "requirement"]),
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { path, kind } = c.req.valid("json");

      const service = TargetPathsService.initialize();
      const result = await service.call("validatePath", rulesetId, path, kind);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  /**
   * POST /api/rulesets/:id/customization/target/paths/completions
   * Get paginated completion suggestions for a partial path
   */
  .post(
    "/:id/customization/target/paths/completions",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        partialPath: z.string(),
        position: z.number(),
        kind: z.enum(["modifier", "requirement"]),
        entityType: z.string().optional(),
        search: z.string().optional(),
        flat: z.boolean().optional(),
        limit,
        page,
      }),
    ),
    async (c) => {
      const { id: rulesetId } = c.req.valid("param");
      const { partialPath, position, kind, entityType, search, flat, limit, page } = c.req.valid("json");

      const service = TargetPathsService.initialize();
      const result = await service.call(
        "getCompletions",
        rulesetId,
        partialPath,
        position,
        kind,
        entityType,
        search,
        limit,
        page,
        flat,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );

export default targetPaths;
