/** What several of the public API's routes take: a page of a list, and a ruleset's entity kinds. */

import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";

/** A customization route's entity: the ruleset (`:id`), its kind among those customized (`:kind`), and its id. */
export const customizedParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.storage().customizableKinds())
    .meta({ description: "The entity's kind: `feats`, `spells`, `items`, `races`, `classes`, `class-levels`" }),
});

/** A ruleset route's `:id` (the ruleset) and its entity kind (`:kind`): a kind no other owns, as the engine names it. */
export const kindParams = idParam.extend({
  kind: z
    .string()
    .pipe(z.enum(Engine.storage().standaloneKinds()))
    .meta({ description: "The entity kind: `feats`, `spells`, `classes`, `items`, `races`…" }),
});

/** A ruleset route's entity: its kind's params, and its id. */
export const entityParams = kindParams.extend({ entityId: z.string().uuid() });

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};
