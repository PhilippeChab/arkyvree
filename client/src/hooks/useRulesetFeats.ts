import { keepPreviousData } from "@tanstack/react-query";

import { rulesetFeatsQuery } from "@/client/src/lib/queries.ts";

import { useListboxQuery } from "./useListboxQuery.ts";

/**
 * Feats of a ruleset with their aptitudes, for pickers: a ruleset has hundreds, so they are
 * searched on the server and paged in as the listbox scrolls (`onScroll`, with `ScrollSafeListbox`).
 * The previous results stay listed while the next search loads.
 */
export function useRulesetFeats(rulesetId: string, search = "", enabled = true) {
  return useListboxQuery({ ...rulesetFeatsQuery(rulesetId, search), placeholderData: keepPreviousData, enabled });
}
