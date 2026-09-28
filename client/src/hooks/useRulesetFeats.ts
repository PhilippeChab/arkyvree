import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { useListboxQuery } from "./useListboxQuery.ts";

/**
 * Feats of a ruleset with their aptitudes, for pickers: a ruleset has hundreds, so they are
 * searched on the server and paged in as the listbox scrolls (`onScroll`, with `ScrollSafeListbox`).
 */
export function useRulesetFeats(rulesetId: string, search = "", enabled = true) {
  return useListboxQuery({
    queryKey: queryKeys.rulesets.feats(rulesetId, search),
    queryFn: async ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].feats.$get({
      param: { id: rulesetId },
      query: { page: pageParam.toString(), limit: "50", search: search || undefined },
    })),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled,
  });
}
