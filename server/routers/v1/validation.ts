/** What several of the public API's routers take: a page of a list, a customized entity, a modifier's body. */

import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { modifierOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";

/** A customization route's entity: the ruleset (`:id`), its kind among those customized (`:kind`), and its id. */
export const customizedParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.storage().customizableKinds())
    .meta({ description: "The entity's kind, among those the rules customize" }),
});

/** What a modifier's body says, a character's own and an entity's alike: what it changes, how, and by what. */
export const modifierFields = {
  operator: modifierOperator.meta({ description: "`add`, `subtract`, `multiply`, `divide` or `set`" }),
  target: z
    .string()
    .min(1)
    .meta({ description: "The target path it changes, as `…/customization/target` completes it" }),
  value: z.string().min(1),
};

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};
