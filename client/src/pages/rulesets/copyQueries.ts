import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

/** A source's query still fetching as its copy is seeded: the copy's query, as it was seeded (its data's updates) */
interface PendingSeed {
  copy: Query;
  updates: number;
}

/**
 * Lands what each source query still fetching answers (`pending`, by its hash) on its copy, the save's refetch among
 * them, which the server answers for the copy (it reads an inherited entity's id as its copy's): the page moves to the
 * copy a moment later, and would show the older seed first. Not once the copy fetches its own, or holds anything else,
 * nor once the source's query is gone.
 */
function forwardPendingFetches(queryClient: QueryClient, pending: Map<string, PendingSeed>) {
  const cache = queryClient.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    const { query } = event;
    const seeded = pending.get(query.queryHash);
    if (!seeded || (event.type !== "removed" && (event.type !== "updated" || query.state.fetchStatus === "fetching")))
      return;
    pending.delete(query.queryHash);
    if (pending.size === 0) unsubscribe();
    const { copy } = seeded;
    const untouched =
      cache.find({ queryKey: copy.queryKey, exact: true }) === copy &&
      copy.state.dataUpdateCount === seeded.updates &&
      copy.state.fetchStatus !== "fetching";
    if (event.type === "updated" && event.action.type === "success" && untouched)
      seed(queryClient, copy.queryKey, query.state.data);
  });
}

/** The copy's `copyKey`, stale: it refetches its own rows as soon as the page reads it */
function seed(queryClient: QueryClient, copyKey: QueryKey, data: unknown) {
  queryClient.setQueryData(copyKey, data);
  void queryClient.invalidateQueries({ queryKey: copyKey, exact: true, refetchType: "none" });
  return queryClient.getQueryCache().find({ queryKey: copyKey, exact: true });
}

/**
 * Caches what the page reads of an inherited entity under its copy's id, as a copy-on-write moves the page to the copy:
 * every query of the ruleset that names the source by its id (its details, its tabs' rows, its tables, whatever kind it
 * is) is copied to the same key naming the copy, which then shows what the source's did, at once, instead of loading
 * from nothing. Each is stale, so it refetches the copy's own rows as soon as the page reads it, and one the source was
 * still fetching takes what that fetch answers. A key the copy already has (a save's row, which its page stored) is
 * kept. Only the ruleset's queries: an inherited entity keeps its id in every fork.
 */
export function seedCopyQueries(queryClient: QueryClient, rulesetId: string, sourceId: string, copyId: string) {
  const pending = new Map<string, PendingSeed>();
  for (const query of queryClient.getQueryCache().findAll({ queryKey: QUERY_KEYS.rulesets.detail(rulesetId) })) {
    if (query.state.data === undefined || !query.queryKey.includes(sourceId)) continue;
    const copyKey = query.queryKey.map((part) => (part === sourceId ? copyId : part));
    if (queryClient.getQueryData(copyKey) !== undefined) continue;
    const copy = seed(queryClient, copyKey, query.state.data);
    if (copy && query.state.fetchStatus === "fetching")
      pending.set(query.queryHash, { copy, updates: copy.state.dataUpdateCount });
  }
  if (pending.size > 0) forwardPendingFetches(queryClient, pending);
}
