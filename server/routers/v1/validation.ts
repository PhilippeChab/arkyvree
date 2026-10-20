/** What several of the public API's routes take: a page of a list, and a page of a ruleset's content. */

import { z } from "zod";

import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { CUSTOMIZABLE_ENTITY_TYPES } from "@/shared/customization/entities.ts";

import { toV1Kind } from "./kinds.ts";

/** The kinds whose entities have modifiers and requirements, as v1 names them, each its entity type. */
const customizableKinds = new Map(CUSTOMIZABLE_ENTITY_TYPES.map((entityType) => [toV1Kind(entityType), entityType]));

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

/** A customization route's entity: the ruleset (`id`), and the entity by its kind and its id. */
export const customizableParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum([...customizableKinds.keys()] as [string, ...string[]])
    .transform((kind) => customizableKinds.get(kind)!),
});

/** As `customizableParams`, for what owns requirements: a modifier too (`modifiers`). */
export const requirementOwnerParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(["modifiers", ...customizableKinds.keys()])
    .transform((kind) => (kind === "modifiers" ? kind : customizableKinds.get(kind)!)),
});
