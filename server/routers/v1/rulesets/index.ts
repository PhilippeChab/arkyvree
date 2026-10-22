import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import {
  v1FieldDeclarations,
  v1Ruleset,
  v1RulesetChanges,
  v1RulesetExtensions,
  v1RulesetPage,
  v1RulesetSettings,
} from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetFieldsService } from "@/server/services/rulesets/fields/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";

import abilities from "./abilities/index.ts";
import aptitudes from "./aptitudes/index.ts";
import classes from "./classes/index.ts";
import customization from "./customization/index.ts";
import feats from "./feats/index.ts";
import items from "./items/index.ts";
import languages from "./languages/index.ts";
import mechanics from "./mechanics/index.ts";
import races from "./races/index.ts";
import saves from "./saves/index.ts";
import skills from "./skills/index.ts";
import spells from "./spells/index.ts";

/** The rulesets the key's user reads: a page of them, one, its settings and fields, and its content. */
export default new Hono<ApiKeyContext>()
  .route("/", abilities)
  .route("/", aptitudes)
  .route("/", classes)
  .route("/", feats)
  .route("/", items)
  .route("/", languages)
  .route("/", mechanics)
  .route("/", races)
  .route("/", saves)
  .route("/", skills)
  .route("/", spells)
  .route("/", customization)
  .get(
    "/",
    describeRoute({ response: v1RulesetPage, status: 200, summary: "Rulesets, a page at a time" }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        scope: z
          .enum(["base", "community", "createdByMe", "contributedTo", "starred"])
          .optional()
          .meta({
            description:
              "Which: the app's own (`base`), others' published ones (`community`), the user's, those they " +
              "contribute to, or those they starred",
          }),
        search: z.string().optional().meta({ description: "A part of the name" }),
      }),
    ),
    async (c) => {
      const { limit, page, scope, search } = c.req.valid("query");
      const rulesets = await RulesetsService.getRulesets(c.var.requestSession, { scope, search }, { limit, page });
      return c.json(V1.page(rulesets, V1.ruleset), 200);
    },
  )
  .get(
    "/:id",
    describeRoute({ response: v1Ruleset, status: 200, summary: "A ruleset" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/changes",
    describeRoute({
      response: v1RulesetChanges,
      status: 200,
      summary: "What a fork changed of the ruleset it's forked from: each entity added, modified or deleted",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.rulesetChanges(await RulesetChangesService.getChanges(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/extensions",
    describeRoute({ response: v1RulesetExtensions, status: 200, summary: "The extensions a ruleset is subscribed to" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(c.var.requestSession, id)), 200);
    },
  )
  .get(
    "/:id/fields",
    describeRoute({
      response: v1FieldDeclarations,
      status: 200,
      summary: "The fields a ruleset declares, by entity kind: what an entity's `fields` hold",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.fieldDeclarations(await RulesetFieldsService.getFields(id)), 200);
    },
  )
  .get(
    "/:id/settings",
    describeRoute({ response: v1RulesetSettings, status: 200, summary: "A ruleset's settings" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.rulesetSettings(await RulesetSettingsService.getSettings(id)), 200);
    },
  );
