import { Hono } from "hono";
import { z } from "zod";

import { rulesetKind } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Ruleset, v1RulesetPage } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";

import changes from "./changes/index.ts";
import modifiers from "./customization/modifiers/index.ts";
import requirements from "./customization/requirements/index.ts";
import entities from "./entities/index.ts";
import extensions from "./extensions/index.ts";
import settings from "./settings/index.ts";

/**
 * The rulesets the key's user can read: a page of them and one; their changes, extensions and settings, their entities
 * of every kind, and those entities' modifiers and requirements, each a router of its own.
 */
export default new Hono<ApiKeyContext>()
  .route("/", changes)
  .route("/", entities)
  .route("/", extensions)
  .route("/", modifiers)
  .route("/", requirements)
  .route("/", settings)
  .get(
    "/",
    describeRoute({
      response: v1RulesetPage,
      status: 200,
      summary: "The rulesets the key's user can read, a page at a time",
    }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        kind: z.enum(rulesetKind.enumValues).optional().meta({ description: "Only rulesets, or only extensions" }),
        orderBy: z.enum(["createdAt", "updatedAt"]).optional(),
        orderDir: z.enum(["asc", "desc"]).optional(),
        scope: z
          .enum([
            "base",
            "forked",
            "community",
            "createdByMe",
            "createdByMePrivate",
            "archived",
            "published",
            "starred",
            "campaignAccessible",
            "myDrafts",
            "extensions",
            "systems",
            "contributedTo",
          ])
          .optional()
          .meta({
            description: "Which of them: its own, those it contributes to, the community's… All it can use, unsaid",
          }),
        search: z.string().optional().meta({ description: "A part of the name" }),
      }),
    ),
    async (c) => {
      const { kind, limit, orderBy, orderDir, page, scope, search } = c.req.valid("query");
      const rulesets = await RulesetsService.getRulesets(
        c.var.requestSession,
        { kind, orderBy, orderDir, scope, search },
        { limit, page },
      );
      return c.json(V1.page(rulesets, V1.rulesetSummary), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({ response: v1Ruleset, status: 200, summary: "A ruleset, with what the key's user may do with it" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  );
