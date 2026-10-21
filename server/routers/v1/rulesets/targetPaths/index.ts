import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1TargetPathPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizableKind, PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";

/** The paths a ruleset's modifiers and requirements target: what they change, and what they check. */
export default new Hono<ApiKeyContext>().get(
  "/:id/target-paths",
  describeRoute({
    response: v1TargetPathPage,
    status: 200,
    summary: "The target paths that complete `path`, a segment at a time, or every whole path whose name has `search`",
  }),
  validate("param", idParam),
  validate(
    "query",
    z.object({
      ...PAGE_FILTERS,
      entityKind: z
        .union([z.literal("characters"), customizableKind])
        .optional()
        .meta({
          description:
            "Only the paths an entity of this kind's modifiers take, some a kind's alone: a character's own " +
            "(`characters`) too",
        }),
      kind: z
        .enum(["modifier", "requirement"])
        .default("modifier")
        .meta({ description: "Whose target: a modifier's (what it changes), or a requirement's (what it checks)" }),
      path: z.string().default("").meta({ description: "The path so far: `abilities.`, `abilities.strength.`" }),
      search: z.string().optional().meta({ description: "A part of a whole path's name: every one that has it" }),
    }),
  ),
  async (c) => {
    const { id } = c.req.valid("param");
    const { entityKind, kind, limit, page, path, search } = c.req.valid("query");
    // An empty search is none: it completes the path
    const completions = await TargetPathsService.getCompletions(
      id,
      path,
      path.length,
      kind,
      entityKind,
      search || undefined,
      limit,
      page,
      !!search,
    );
    return c.json(V1.page(completions, V1.targetPath), 200);
  },
);
