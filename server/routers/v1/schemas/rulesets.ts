/** A ruleset as v1 answers it: what it is, its settings, its extensions and its changes. */

import { z } from "zod";

import { buildPageSchema, v1Id } from "./references.ts";

/** What the key's user may do with a ruleset. */
export const v1RulesetPermissions = z
  .strictObject({
    canBeExtension: z.boolean(),
    canEditEntities: z.boolean(),
    canEditRuleset: z.boolean(),
    canFork: z.boolean(),
    canInviteContributors: z.boolean(),
    canLeave: z.boolean(),
    canManageAdminContributors: z.boolean(),
    canManageContributors: z.boolean(),
    canPublish: z.boolean(),
    canReadContributors: z.boolean(),
    canSubscribeExtensions: z.boolean(),
    canUnarchive: z.boolean(),
    canUnsubscribeExtensions: z.boolean(),
    canUpdateContributorRoles: z.boolean(),
    canViewChanges: z.boolean(),
  })
  .meta({ description: "What the key's user may do with it", id: "RulesetPermissions" });

/** A ruleset, in a page of them. */
export const v1RulesetSummary = z
  .strictObject({
    baseRules: z.string().meta({ description: "The game its rules are: `Dungeons & Dragons: 3.5`" }),
    createdAt: z.string(),
    description: z.string(),
    id: v1Id,
    kind: z.enum(["ruleset", "extension"]).meta({ description: "An extension is content others subscribe to" }),
    name: z.string(),
    ownerId: z.string().nullable().meta({ description: "Its owner, none for the app's own" }),
    parentId: v1Id.nullable().meta({ description: "The ruleset it's forked from, none for a base" }),
    parentName: z.string().nullable(),
    private: z.boolean(),
    starCount: z.number().int(),
    starred: z.boolean().meta({ description: "Whether the key's user starred it" }),
    status: z.enum(["Draft", "Published", "Archived"]),
    system: z.boolean().meta({ description: "One of the app's own, which no user owns" }),
    updatedAt: z.string(),
  })
  .meta({ description: "A ruleset, in a page of them", id: "RulesetSummary" });

/** A ruleset, with what the key's user may do with it. */
export const v1Ruleset = v1RulesetSummary
  .extend({
    contributorRole: z
      .enum(["Admin", "Editor", "Viewer"])
      .nullable()
      .meta({ description: "The key's user's role, when they contribute to it" }),
    permissions: v1RulesetPermissions,
  })
  .meta({ description: "A ruleset, with what the key's user may do with it", id: "Ruleset" });

export const v1RulesetChanges = z
  .array(
    z.strictObject({
      entityId: v1Id.nullable().meta({ description: "The ruleset's own entity, none when it's deleted" }),
      kind: z.string().meta({ description: "The entity's kind, as its route names it: `classes`, `feats`" }),
      name: z.string(),
      sourceId: v1Id.nullable().meta({ description: "The entity it changes of its parent's, none when it's added" }),
      status: z.enum(["added", "deleted", "modified"]),
    }),
  )
  .meta({ description: "What a fork changed of the ruleset it's forked from", id: "RulesetChanges" });

export const v1RulesetExtensions = z
  .array(
    z.strictObject({
      description: z.string(),
      id: v1Id,
      name: z.string(),
      subscribedAt: z.string(),
      updateAvailable: z.boolean().meta({ description: "Whether it changed since the ruleset subscribed to it" }),
    }),
  )
  .meta({ description: "The extensions a ruleset is subscribed to", id: "RulesetExtensions" });

export const v1RulesetPage = buildPageSchema(v1RulesetSummary);

export const v1RulesetSettings = z
  .strictObject({
    fields: z.record(z.string(), z.unknown()).meta({ description: "Its own fields, by their stored names" }),
    links: z
      .record(z.string(), z.unknown())
      .meta({ description: "The entities it names, by role: the ability skill points add" }),
  })
  .meta({ description: "A ruleset's settings: its own fields and links", id: "RulesetSettings" });
