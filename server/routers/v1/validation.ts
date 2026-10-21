/** What several of the public API's routes take: a page of a list, and a page of a ruleset's content. */

import { z } from "zod";

import { entityFields, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { RESTORABLE_ENTITY_TYPES } from "@/server/services/rulesets/changes/index.ts";
import { CUSTOMIZABLE_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { MODIFIER_OPERATORS } from "@/shared/customization/operators.ts";

import { toV1Kind } from "./kinds.ts";

/** The kinds whose entities have modifiers and requirements, as v1 names them, each its entity type. */
const customizableKinds = new Map(CUSTOMIZABLE_ENTITY_TYPES.map((entityType) => [toV1Kind(entityType), entityType]));

/** The kinds whose entities a fork's change to restores to its parent's, as v1 names them, each its entity type. */
const restorableKinds = new Map(RESTORABLE_ENTITY_TYPES.map((entityType) => [toV1Kind(entityType), entityType]));

/** A ruleset route's `:id` (the ruleset) and `:classId`. */
export const classParams = idParam.extend({ classId: z.string().uuid() });

/** A yes or no in a query string, `true` or `false`: none when the query leaves it out. */
export const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};

/** A page of a ruleset's content: searched by name, sorted, and its own entities alone (`childOnly`). */
export const CONTENT_FILTERS = {
  ...PAGE_FILTERS,
  childOnly: flag.meta({
    description: "Only the ruleset's own entities, none it inherits from its parent or its extensions",
  }),
  orderBy: entityOrderBy,
  orderDir: orderDirAsc,
  search: z.string().optional().meta({ description: "A part of the name" }),
};

/** A kind whose entities have modifiers and requirements, as v1 names it, read back as its entity type. */
export const customizableKind = z
  .enum([...customizableKinds.keys()] as [string, ...string[]])
  .transform((kind) => customizableKinds.get(kind)!);

/** A customization route's entity: the ruleset (`id`), and the entity by its kind and its id. */
export const customizableParams = idParam.extend({ entityId: z.string().uuid(), kind: customizableKind });

/** An entity's description, its create's and its update's: none when empty, kept by an update that leaves it out. */
export const entityDescription = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));

/** An entity's fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`): those it changes, by key. */
export const fields = entityFields.optional().meta({
  description: "Its fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`), by key: those it sets",
});

/** How a modifier applies its value. */
export const modifierOperator = z.enum(MODIFIER_OPERATORS);

/** The path a modifier changes. */
export const modifierTarget = z
  .string()
  .min(1)
  .meta({ description: "The path it changes (`GET /v1/rulesets/{id}/target-paths`)" });

/** What a modifier changes its target by, or sets it to. */
export const modifierValue = z
  .string()
  .min(1)
  .meta({ description: "A number, a text or a flag, as its target takes, or a template" });

/** As `customizableParams`, for what owns requirements: a modifier too (`modifiers`). */
export const requirementOwnerParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z.union([z.literal("modifiers"), customizableKind]),
});

/** A fork's entity a restore names: the ruleset (`id`), and the entity by its kind and its id. */
export const restorableParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z.enum([...restorableKinds.keys()] as [string, ...string[]]).transform((kind) => restorableKinds.get(kind)!),
});
