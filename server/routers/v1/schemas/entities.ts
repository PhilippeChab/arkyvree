/**
 * A ruleset's entity as v1 answers it, whatever its kind: its columns, its fields by the names its ruleset declares
 * them, and its links to others, each with its target's name; and what an entity's kind may have past them (owned
 * entities, a progression, tables, a group).
 */

import { z } from "zod";

import { buildPageSchema, v1Id, v1Named } from "./references.ts";

/** A modifier an entity has. */
export const v1EntityModifier = z
  .strictObject({
    id: v1Id,
    operator: z.string().meta({ description: "`add`, `subtract`, `multiply`, `divide` or `set`" }),
    target: z.string().meta({ description: "The target path it changes, as `…/customization/target` completes it" }),
    updatedAt: z.string().meta({ description: "When it last changed, which an update sends back" }),
    value: z.string(),
    valueType: z.string(),
  })
  .meta({ description: "A modifier an entity has", id: "EntityModifier" });

/** A link from an entity to another: its role, and its target with its name. */
export const v1EntityLink = z
  .strictObject({
    amount: z.number().nullable(),
    free: z.boolean(),
    id: v1Id,
    ordinal: z.number(),
    role: z.string().meta({
      description: "What it links for: the `role` a field of `GET /v1/rules` declares",
    }),
    tier: z.number().nullable(),
    toDescription: z.string().nullable().optional(),
    toId: v1Id,
    toName: z.string(),
    toType: z.string().meta({ description: "Its target's kind" }),
    viaId: v1Id.nullable(),
    viaName: z.string().nullable().optional(),
  })
  .meta({ description: "A link from an entity to another, its target named", id: "EntityLink" });

/** An entity in a page of them: what every entity's answer has. */
export const v1EntitySummary = z
  .strictObject({
    createdAt: z.string(),
    description: z.string().nullable(),
    fields: z
      .record(z.string(), z.unknown())
      .meta({ description: "Its fields, by the names its ruleset declares them" }),
    id: v1Id,
    links: z.array(v1EntityLink),
    name: z.string(),
    ownerId: v1Id.nullable().meta({ description: "The entity that owns it" }),
    partition: z
      .string()
      .meta({ description: "The kind of character it's for, one of the `characterKinds` `GET /v1/rules` lists" }),
    position: z.number().nullable(),
    rulesetId: v1Id,
    type: z.string().meta({ description: "Its kind, one of the `kinds` `GET /v1/rules` lists" }),
    updatedAt: z.string(),
  })
  .meta({ description: "An entity, in a page of them", id: "EntitySummary" });

/** A requirement an entity has, or a group of them. */
export const v1Requirement = z
  .strictObject({
    chainingOperator: z.string().nullable().meta({ description: "A group's `and` or `or`, none for a requirement" }),
    id: v1Id,
    level: z.string().meta({ description: "Where it sits in its tree of groups" }),
    operator: z.string().nullable(),
    target: z.string().nullable(),
    updatedAt: z.string().meta({ description: "When it last changed, which an update sends back" }),
    value: z.string().nullable(),
    valueType: z.string().nullable(),
  })
  .meta({ description: "A requirement an entity has, or a group of them", id: "Requirement" });

/** An entity, with what its kind adds: its modifiers and requirements, where a character may place it. */
export const v1Entity = v1EntitySummary
  .extend({
    modifiers: z.array(v1EntityModifier).optional(),
    placement: z.looseObject({}).optional().meta({
      description:
        "Where a character's inventory may place it, as the rules describe it, for a kind a character carries",
    }),
    requirements: z.array(v1Requirement).optional(),
  })
  .meta({ description: "An entity, with what its kind adds", id: "Entity" });

/** A group of a kind's entities, for a kind whose entities fall in groups. */
export const v1EntityGroup = z
  .strictObject({
    count: z.number(),
    description: z.string().nullable(),
    group: z.string().nullable().meta({
      description: "Its name, a list's `family` filter: none for an entity in no group",
    }),
    id: v1Id,
    name: z.string(),
  })
  .meta({ description: "A group of entities, or an entity in none", id: "EntityGroup" });

export const v1EntityGroupPage = buildPageSchema(v1EntityGroup);

export const v1EntityLinks = z.array(v1EntityLink);

export const v1EntityPage = buildPageSchema(v1EntitySummary);

/** One of an entity's tables, a row a level. */
export const v1EntityTable = z.array(z.looseObject({ id: v1Id })).meta({
  description: "One of an entity's tables, as the rules name it: a row a level, or a list",
  id: "EntityTable",
});

/** A modifier an entity has, as its customization reads it: its target's labels, and its value's. */
export const v1LabeledModifier = v1EntityModifier
  .extend({
    targetLabels: z.record(z.string(), z.string()).meta({ description: "Its path's segments, each by its label" }),
    valueLabel: z.string().nullable(),
  })
  .meta({ description: "A modifier, its target and value labeled", id: "LabeledModifier" });

export const v1LabeledModifiers = z.array(v1LabeledModifier);

/** A requirement an entity has, as its customization reads it: its target's labels, and its value's. */
export const v1LabeledRequirement = v1Requirement
  .extend({ targetLabels: z.record(z.string(), z.string()), valueLabel: z.string().nullable() })
  .meta({ description: "A requirement, its target and value labeled", id: "LabeledRequirement" });

export const v1LabeledRequirements = z.array(v1LabeledRequirement);

/** An entity another owns. */
export const v1OwnedEntity = v1EntitySummary
  .extend({
    modifiers: z.array(v1EntityModifier).optional(),
    name: z.string().nullable().meta({ description: "Its owner's, read on its own" }),
    requirements: z.array(v1Requirement).optional(),
  })
  .meta({ description: "An entity another owns", id: "OwnedEntity" });

export const v1OwnedEntities = z.array(v1OwnedEntity);

/** A page of completions for a target path being typed, with its segments' labels. */
export const v1PathCompletions = z
  .strictObject({
    items: z.array(z.looseObject({})).meta({ description: "Each completion: what it inserts, and its label" }),
    nextPage: z.number().int().nullable(),
    page: z.number().int(),
    segmentLabels: z.record(z.string(), z.string()),
  })
  .meta({ description: "A page of a target path's completions", id: "PathCompletions" });

/** What a target path is: whether it's valid, its errors, and what it could be. */
export const v1PathValidation = z
  .looseObject({ errors: z.array(z.looseObject({})), isValid: z.boolean(), suggestions: z.array(z.string()) })
  .meta({ description: "Whether a target path is valid, its errors, and suggestions", id: "PathValidation" });

/**
 * What an entity's levels give, as its rules describe it: each pool's picks by level, and past them the values the
 * rules name in their progression (`GET /v1/rules`' `progression`).
 */
export const v1Progression = z
  .looseObject({
    pools: z.array(
      v1Named.extend({ picks: z.record(z.string(), z.number()).meta({ description: "Its picks, by level" }) }),
    ),
  })
  .meta({
    description:
      "What an entity's levels give: each pool's picks by level, and past them the values `GET /v1/rules` names " +
      "in the rules' `progression`",
    id: "Progression",
  });

/** An entity as it's stored (a template's): its fields and links by their stored names. */
export const v1StoredEntity = z
  .strictObject({
    description: z.string().nullable(),
    fields: z.record(z.string(), z.unknown()),
    id: v1Id,
    links: z.record(z.string(), z.string()).meta({ description: "The entities it names, by role" }),
    name: z.string(),
    partition: z.string(),
    type: z.string(),
  })
  .meta({ description: "An entity as it's stored", id: "StoredEntity" });

export const v1StoredEntities = z.array(v1StoredEntity);
