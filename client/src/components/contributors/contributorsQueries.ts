/** The contributors' queries, a ruleset's or a character's alike. */

import { infiniteQueryOptions } from "@tanstack/react-query";

import { nextPage } from "@/client/src/lib/pageItems.ts";

import { CONTRIBUTOR_KINDS, type ContributorKind, type ContributorsPage } from "./contributorKinds.ts";

/** A ruleset's or a character's contributors, a page at a time; each page also names its owner. */
export function contributorsQuery(kind: ContributorKind, id: string) {
  const { queryKey, listFn } = CONTRIBUTOR_KINDS[kind];
  return infiniteQueryOptions({
    queryKey: queryKey(id),
    queryFn: async ({ pageParam }): Promise<ContributorsPage> => await listFn(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
