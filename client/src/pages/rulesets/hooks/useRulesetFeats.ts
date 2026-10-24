import { keepPreviousData } from "@tanstack/react-query";

import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

/**
 * Feats of a ruleset with their aptitudes, for pickers: a ruleset has hundreds, so they are
 * searched on the server and paged in as the listbox scrolls (`onScroll`, with `ScrollSafeListbox`).
 * The previous results stay listed while the next search loads.
 */
export function useRulesetFeats(rulesetId: string, search = "", enabled = true) {
  return useListboxQuery({
    ...entityOptionsQuery(rulesetId, "feats", search, { limit: 50 }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
