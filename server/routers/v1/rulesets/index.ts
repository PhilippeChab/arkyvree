import { Hono } from "hono";
import { z } from "zod";

import { rulesetKind } from "@/drizzle/schema.ts";
import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { entityFields, idParam } from "@/server/routers/api/validation.ts";
import {
  v1FieldDeclarations,
  v1Ruleset,
  v1RulesetChanges,
  v1RulesetExtensions,
  v1RulesetPage,
  v1RulesetSettings,
} from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS, restorableParams } from "@/server/routers/v1/validation.ts";
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
import targetPaths from "./targetPaths/index.ts";

const extensionParams = idParam.extend({ extensionId: z.string().uuid() });

/**
 * The rulesets the key's user reads and edits: a page of them, one, its settings, fields, extensions and changes, the
 * actions on it (a fork, a publish, a star, an archive, a restore), and its content, each kind a router of its own.
 */
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
  .route("/", targetPaths)
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
  )
  .post(
    "/:id/archive",
    describeRoute({ response: null, status: 204, summary: "Archives a ruleset: its characters keep it" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.archiveRuleset(c.var.requestSession, id);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/extensions",
    describeRoute({
      response: v1RulesetExtensions,
      status: 201,
      summary: "Subscribes a ruleset to extensions, published rulesets of kind `extension`: answers its extensions",
    }),
    validate("param", idParam),
    validate("json", z.object({ extensionIds: z.array(z.string().uuid()).min(1) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { extensionIds } = c.req.valid("json");
      const session = c.var.requestSession;
      await RulesetExtensionsService.subscribeExtension(session, id, extensionIds);
      return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(session, id)), 201);
    },
  )
  .post(
    "/:id/fork",
    describeRoute({
      response: v1Ruleset,
      status: 201,
      summary: "Forks a published ruleset: a new ruleset of the user's, which inherits its content",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({ description: z.string().optional(), name: z.string().min(1), private: z.boolean().default(true) }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const fork = await RulesetsService.forkRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, fork.id)), 201);
    },
  )
  .post(
    "/:id/publish",
    describeRoute({
      response: v1Ruleset,
      status: 200,
      summary: "Publishes a ruleset: others can read it, fork it or, as an extension, subscribe to it",
    }),
    validate("param", idParam),
    validate("json", z.object({ kind: z.enum(rulesetKind.enumValues).optional() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await RulesetsService.publishRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/star",
    describeRoute({ response: null, status: 204, summary: "Stars a ruleset for the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.starRuleset(c.var.requestSession, id);
      return c.body(null, 204);
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
  .post(
    "/:id/:kind/:entityId/restore",
    describeRoute({
      response: null,
      status: 204,
      summary:
        "Restores a fork's entity to its parent's, its change or its delete undone: `entityId` the parent's entity, " +
        "as `changes` names it (`sourceId`)",
    }),
    validate("param", restorableParams),
    async (c) => {
      const { entityId, id, kind } = c.req.valid("param");
      await RulesetChangesService.revertOverride(c.var.requestSession, id, kind, entityId);
      return c.body(null, 204);
    },
  )
  .put(
    "/:id",
    describeRoute({
      response: v1Ruleset,
      status: 200,
      summary: "Changes a ruleset's name, description and kind: what the body names, the rest kept",
    }),
    validate("param", idParam),
    validate(
      "json",
      z.object({
        description: z.string().optional(),
        kind: z.enum(rulesetKind.enumValues).optional(),
        name: z.string().min(1).optional(),
        private: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      await RulesetsService.updateRuleset(c.var.requestSession, id, body);
      return c.json(V1.ruleset(await RulesetsService.getRuleset(c.var.requestSession, id)), 200);
    },
  )
  .put(
    "/:id/settings",
    describeRoute({
      response: v1RulesetSettings,
      status: 200,
      summary: "Changes a ruleset's settings: the fields it names, as the ruleset declares them (`rulesets`)",
    }),
    validate("param", idParam),
    validate("json", z.object({ fields: entityFields })),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        V1.rulesetSettings(await RulesetSettingsService.updateSettings(c.var.requestSession, id, body)),
        200,
      );
    },
  )
  .delete(
    "/:id/extensions/:extensionId",
    describeRoute({
      response: null,
      status: 204,
      summary: "Unsubscribes a ruleset from an extension: what its characters picked of it stands in its own content",
    }),
    validate("param", extensionParams),
    async (c) => {
      const { extensionId, id } = c.req.valid("param");
      await RulesetExtensionsService.unsubscribeExtension(c.var.requestSession, id, extensionId);
      return c.body(null, 204);
    },
  )
  .delete(
    "/:id/star",
    describeRoute({ response: null, status: 204, summary: "Unstars a ruleset for the key's user" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await RulesetsService.unstarRuleset(c.var.requestSession, id);
      return c.body(null, 204);
    },
  );
