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
import target from "./customization/target/index.ts";
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
  .route("/", target)
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
  )
  .post(
    "/:id/fork",
    describeRoute({ response: v1Ruleset, status: 201, summary: "Forks a ruleset, answering the fork" }),
    validate("param", idParam),
    validate("json", z.object({ description: z.string(), name: z.string(), private: z.boolean() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const fork = await RulesetsService.forkRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, fork.id)), 201);
    },
  )
  .post(
    "/:id/publish",
    describeRoute({ response: v1Ruleset, status: 200, summary: "Publishes a ruleset, or an extension" }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        kind: z.enum(rulesetKind.enumValues).optional().meta({ description: "Publishes it as an extension, or not" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await RulesetsService.publishRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/star",
    describeRoute({ response: v1Ruleset, status: 200, summary: "Stars a ruleset for the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.starRuleset(c.var.requestSession, id);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/unarchive",
    describeRoute({ response: v1Ruleset, status: 200, summary: "Unarchives a ruleset" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.unarchiveRuleset(c.var.requestSession, id);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .put(
    "/:id",
    describeRoute({ response: v1Ruleset, status: 200, summary: "Updates a ruleset's name, description or privacy" }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        description: z.string(),
        kind: z.enum(rulesetKind.enumValues).optional(),
        name: z.string(),
        private: z.boolean().optional(),
        updatedAt: z.string().optional().meta({ description: "When it was read: refused if it changed since (409)" }),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await RulesetsService.updateRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id",
    describeRoute({ response: null, status: 204, summary: "Archives a ruleset" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.archiveRuleset(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/star",
    describeRoute({ response: v1Ruleset, status: 200, summary: "Unstars a ruleset for the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.unstarRuleset(c.var.requestSession, id);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  );
