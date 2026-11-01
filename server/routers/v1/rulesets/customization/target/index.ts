import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { v1PathCompletions, v1PathValidation } from "@/server/routers/v1/schemas/entities.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";

/** What a target path is checked as: a modifier's, a requirement's, or a template's. */
const pathKind = z.enum(["modifier", "requirement", "template"]);

/** A ruleset's target paths, which a modifier or a requirement names: completed as they're typed, and validated. */
export default new Hono<ApiKeyContext>()
  .post(
    "/:id/customization/target/paths/completions",
    describeRoute({
      response: v1PathCompletions,
      status: 200,
      summary: "A page of completions for a target path being typed, at the cursor's position",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        entityType: z.string().optional().meta({ description: "The kind of the entity it customizes" }),
        flat: z.boolean().optional().meta({ description: "Every path at once, not a segment at a time" }),
        kind: pathKind,
        limit,
        page,
        partialPath: z.string(),
        position: z.number().meta({ description: "The cursor's position in the path" }),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entityType, flat, kind, limit, page, partialPath, position, search } = c.req.valid("json");
      const completions = await TargetPathsService.getCompletions(
        c.var.requestSession,
        id,
        partialPath,
        position,
        kind,
        entityType,
        search,
        limit,
        page,
        flat,
      );
      return c.json(V1.pathCompletions(completions), 200);
    },
  )
  .post(
    "/:id/customization/target/paths/validate",
    describeRoute({
      response: v1PathValidation,
      status: 200,
      summary: "Whether a target path is valid, its errors, and what it could be",
    }),
    validate("param", idParam),
    validate("json", z.object({ entityType: z.string().optional(), kind: pathKind, path: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entityType, kind, path } = c.req.valid("json");
      const validation = await TargetPathsService.validatePath(c.var.requestSession, id, path, kind, entityType);
      return c.json({ ...validation }, 200);
    },
  );
