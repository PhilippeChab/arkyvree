/** What several of the public API's routes take: a page of a list, and a page of a ruleset's content. */

import { z } from "zod";

import { entityFields, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import type { RestorableEntityType } from "@/server/services/rulesets/changes/index.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";

/** The kinds whose entities have modifiers and requirements, as v1 names them, each its entity type. */
const CUSTOMIZABLE_KINDS = {
  "class-levels": "klass_levels",
  classes: "klasses",
  feats: "feats",
  items: "items",
  races: "races",
  spells: "powers",
} as const satisfies Record<string, CustomizableEntityType>;

/** The kinds a fork's change to restores to its parent's, as v1 names them, each its entity type. */
const RESTORABLE_KINDS = {
  aptitudes: "aptitudes",
  classes: "klasses",
  feats: "feats",
  items: "items",
  languages: "languages",
  mechanics: "mechanics",
  races: "races",
  saves: "saves",
  skills: "skills",
  spells: "powers",
} as const satisfies Record<string, RestorableEntityType>;

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
  .enum(["class-levels", "classes", "feats", "items", "races", "spells"])
  .transform((kind) => CUSTOMIZABLE_KINDS[kind]);

/** A customization route's entity: the ruleset (`id`), and the entity by its kind and its id. */
export const customizableParams = idParam.extend({ entityId: z.string().uuid(), kind: customizableKind });

/** An entity's description, its create's and its update's: none when it's empty, kept by an update that leaves it out. */
export const entityDescription = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));

/** An entity's fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`): those it changes, by key. */
export const fields = entityFields.optional().meta({
  description: "Its fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`), by key: those it sets",
});

/** As `customizableParams`, for what owns requirements: a modifier too (`modifiers`). */
export const requirementOwnerParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(["class-levels", "classes", "feats", "items", "modifiers", "races", "spells"])
    .transform((kind) => (kind === "modifiers" ? kind : CUSTOMIZABLE_KINDS[kind])),
});

/** A fork's entity a restore names: the ruleset (`id`), and the entity by its kind and its id. */
export const restorableParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(["aptitudes", "classes", "feats", "items", "languages", "mechanics", "races", "saves", "skills", "spells"])
    .transform((kind) => RESTORABLE_KINDS[kind]),
});
