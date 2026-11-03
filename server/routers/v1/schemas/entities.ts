/**
 * A ruleset's entity as v1 answers it, whatever its kind: its columns, its fields by the names its ruleset declares
 * them, and its links to others, each with its target's name; and what an entity's kind may have past them (owned
 * entities, a progression, tables, a group).
 */

import { z } from "zod";

import type { PathCompletion, PathError, PathValueType } from "@/shared/customization/target.ts";

import { buildPageSchema, v1Id, v1Named } from "./references.ts";

/**
 * What a target path's completion is, as v1 names it: written out, so that a kind the app adds or drops stops v1's
 * translator compiling, rather than changing v1's answers.
 */
const V1_COMPLETION_KINDS = [
  "category",
  "group",
  "operator",
  "property",
  "value",
] as const satisfies readonly PathCompletion["kind"][];

/** How much a target path's error weighs, as v1 names it: written out, as a completion's kinds are. */
const V1_PATH_ERROR_SEVERITIES = ["error", "warning", "info"] as const satisfies readonly PathError["severity"][];

/** The types of value a target path holds, as v1 names them: written out, as a completion's kinds are. */
const V1_PATH_VALUE_TYPES = ["number", "string", "boolean"] as const satisfies readonly PathValueType[];

/** Where a character's inventory may place an entity of a kind a character carries, as its rules describe it. */
const v1EntityPlacement = z
  .strictObject({
    charges: z.number().int().nullable().meta({ description: "The charges it comes with, none for one without" }),
    locationFieldLabel: z.string().meta({ description: "What its form calls the place it's put in" }),
    locations: z
      .array(
        z.strictObject({
          grouped: z.boolean().meta({ description: "Whether an entry there is held in groups: a body's `groups`" }),
          location: z.string().meta({ description: "A place, as its rules name it: a body's `location`" }),
        }),
      )
      .meta({ description: "The places it can take" }),
    slot: z.string().nullable().meta({ description: "The place it goes to once picked: none leaves it to the body" }),
  })
  .meta({
    description: "Where a character's inventory may place it, as the rules describe it, for a kind a character carries",
    id: "EntityPlacement",
  });

/** A value a target path takes, by its label. */
const v1PathValue = z.strictObject({ label: z.string(), value: z.string() });

/** The type of value a target path holds. */
const v1PathValueType = z.enum(V1_PATH_VALUE_TYPES);

/** A completion of a target path being typed: what it inserts, and what its path takes once it's a whole one. */
const v1PathCompletion = z
  .strictObject({
    detail: z.string(),
    documentation: z.string(),
    insertText: z.string().meta({ description: "What it inserts at the cursor" }),
    kind: z.enum(V1_COMPLETION_KINDS),
    label: z.string(),
    literalOnly: z
      .boolean()
      .optional()
      .meta({ description: "Whether its path takes a literal value only, a whole one's" }),
    operators: z.array(z.string()).optional().meta({ description: "The operators its path takes, a whole one's" }),
    path: z.string().optional().meta({ description: "Its whole path, once it completes one" }),
    possibleValues: z
      .array(v1PathValue)
      .optional()
      .meta({ description: "The values its path takes, when it names them" }),
    setValues: z.array(v1PathValue).optional().meta({ description: "The values a `set` on its path takes alone" }),
    sortOrder: z.number().optional(),
    valueType: v1PathValueType.optional().meta({ description: "The type of value its path holds, a whole one's" }),
  })
  .meta({ description: "A completion of a target path being typed", id: "PathCompletion" });

/** What's wrong with a target path, and where. */
const v1PathError = z.strictObject({
  code: z.string().meta({ description: "`INVALID_CATEGORY`, `INCOMPLETE_PATH`, `INVALID_PATH`…" }),
  message: z.string(),
  position: z.strictObject({ end: z.number().int(), start: z.number().int() }),
  severity: z.enum(V1_PATH_ERROR_SEVERITIES),
});

/** A valid target path's definition: what it takes. */
const v1PathTarget = z
  .strictObject({
    allowedEntityTypes: z
      .array(z.string())
      .optional()
      .meta({ description: "The kinds of entity whose modifiers may change it, when not every kind's" }),
    category: z.string(),
    description: z.string(),
    groupDescription: z.string().optional(),
    literalOnly: z
      .boolean()
      .optional()
      .meta({ description: "Whether it takes a literal value only, never a template" }),
    minValue: z.number().optional().meta({ description: "The least number an operator but a restricted `set` takes" }),
    operators: z.array(z.string()),
    path: z.string(),
    possibleValues: z.array(v1PathValue).optional().meta({ description: "The values it takes, when it names them" }),
    readsMany: z
      .boolean()
      .optional()
      .meta({ description: "Whether it reaches several values, which no template reads" }),
    setValues: z.array(v1PathValue).optional().meta({ description: "The values a `set` on it takes alone" }),
    sortOrder: z.number().optional(),
    valueType: v1PathValueType,
  })
  .meta({ description: "A valid target path's definition: what it takes", id: "PathTarget" });

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
    placement: v1EntityPlacement.optional(),
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

/** One of an entity's tables, a row a position. */
export const v1EntityTable = z.array(z.looseObject({ id: v1Id })).meta({
  description: "One of an entity's tables, as the rules name it: a row a position, or a list",
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
    items: z.array(v1PathCompletion).meta({ description: "Each completion: what it inserts, and its label" }),
    nextPage: z.number().int().nullable(),
    page: z.number().int(),
    segmentLabels: z.record(z.string(), z.string()),
  })
  .meta({ description: "A page of a target path's completions", id: "PathCompletions" });

/** What a target path is: whether it's valid, its errors, what it could be, and what a valid one takes. */
export const v1PathValidation = z
  .strictObject({
    completions: z
      .array(v1PathCompletion)
      .max(0)
      .meta({ description: "Always empty: a path's completions are `…/paths/completions`' answer" }),
    errors: z.array(v1PathError),
    isValid: z.boolean(),
    suggestions: z.array(z.string()).meta({ description: "The paths it could be, an incomplete or a mistyped one's" }),
    target: v1PathTarget.optional().meta({ description: "What it takes, a valid path's alone" }),
  })
  .meta({
    description: "Whether a target path is valid, its errors, suggestions, and what a valid one takes",
    id: "PathValidation",
  });

/**
 * What an entity's progression gives, as its rules describe it: each pool's picks by an owned entity's id, and past
 * them the values the rules name in their progression (`GET /v1/rules`' `progression`).
 */
export const v1Progression = z
  .looseObject({
    pools: z.array(
      v1Named.extend({
        picks: z
          .record(z.string(), z.number())
          .meta({ description: "Its picks, by the id of the owned entity that gives them" }),
      }),
    ),
  })
  .meta({
    description:
      "What an entity's progression gives: each pool's picks by an owned entity's id, and past them the values " +
      "`GET /v1/rules` names in the rules' `progression`",
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
