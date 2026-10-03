import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";

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
      return c.json(await TargetPathsService.validatePath(rulesetId, path, kind), 200);
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
      return c.json(
        await TargetPathsService.getCompletions(
          rulesetId,
          partialPath,
          position,
          kind,
          entityType,
          search,
          limit,
          page,
          flat,
        ),
        200,
      );
    },
  );

export default targetPaths;
