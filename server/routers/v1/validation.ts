/** What several of the public API's routers take: a page of a list, and a customized entity. */

import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";

/** A customization route's entity: the ruleset (`:id`), its kind among those customized (`:kind`), and its id. */
export const customizedParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.storage().customizableKinds())
    .meta({ description: "The entity's kind, among those the rules customize" }),
});

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};
