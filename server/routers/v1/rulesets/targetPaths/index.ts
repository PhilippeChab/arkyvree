import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1TargetPathCheck, v1TargetPathPage } from "@/server/routers/v1/schemas/content.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { customizableKind, PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";

/** What a target path is for, and the kind of entity whose modifier or requirement takes it. */
const pathQuery = z.object({
  entityKind: customizableKind
    .optional()
    .meta({ description: "Only the paths an entity of this kind's modifiers take: some are a kind's alone" }),
  kind: z
    .enum(["modifier", "requirement"])
    .default("modifier")
    .meta({ description: "Whose target: a modifier's (what it changes), or a requirement's (what it checks)" }),
});

/** The paths a ruleset's modifiers and requirements target: what they change, and what they check. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/target-paths",
    describeRoute({
      response: v1TargetPathPage,
      status: 200,
      summary:
        "The target paths that complete `path`, a segment at a time, or every whole path whose name has `search`",
    }),
    validate("param", idParam),
    validate(
      "query",
      pathQuery.extend({
        ...PAGE_FILTERS,
        path: z.string().default("").meta({ description: "The path so far: `abilities.`, `abilities.strength.`" }),
        search: z.string().optional().meta({ description: "A part of a whole path's name: every one that has it" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entityKind, kind, limit, page, path, search } = c.req.valid("query");
      const flat = search !== undefined;
      const completions = await TargetPathsService.getCompletions(
        id,
        path,
        path.length,
        kind,
        entityKind,
        search,
        limit,
        page,
        flat,
      );
      return c.json(V1.page(completions, V1.targetPath), 200);
    },
  )
  .get(
    "/:id/target-paths/check",
    describeRoute({
      response: v1TargetPathCheck,
      status: 200,
      summary: "Whether a path is one a modifier or a requirement may target, what it takes, or what it may have meant",
    }),
    validate("param", idParam),
    validate("query", pathQuery.extend({ path: z.string().meta({ description: "The whole path" }) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { entityKind, kind, path } = c.req.valid("query");
      return c.json(V1.targetPathCheck(await TargetPathsService.validatePath(id, path, kind, entityKind)), 200);
    },
  );
