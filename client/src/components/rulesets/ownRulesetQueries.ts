/** The user's own rulesets to play, which a new character's dialog starts on when there's one (`findOwnRuleset`). */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** How many of the user's rulesets the dialog asks for: two tell one from more. */
const OWN_RULESETS_ASKED = 2;

/**
 * The user's own rulesets to play, the first two: their forks the server filters to those published as a ruleset, not
 * an extension, however many there are.
 */
export function ownRulesetsQuery() {
  const query = { scope: "forked", kind: "ruleset", limit: String(OWN_RULESETS_ASKED), page: "1" } as const;
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.list(query),
    queryFn: async () => (await parseResponse(rpc.api.rulesets.$get({ query }))).items,
  });
}
