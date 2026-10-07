/** Queries of the character pages: the races a new character can take, and a character's modifiers and contributors. */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * The races a ruleset offers a new character, each marked eligible or not for its alignment and gender (`""` while
 * unpicked); skipped until a ruleset is picked.
 */
export function availableRacesQuery(rulesetId: string, alignment: string, gender: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.availableRaces(rulesetId, { alignment, gender }),
    queryFn: rulesetId
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters["available-races"].$get({
              query: {
                rulesetId,
                alignment: alignment || undefined,
                gender: gender || undefined,
                limit: "100",
                page: pageParam.toString(),
              },
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

/** A character's contributors, a page at a time; each page also names its owner. */
export function characterContributorsQuery(characterId: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.contributors(characterId),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.characters[":id"].contributors.$get({
          param: { id: characterId },
          query: { page: pageParam.toString(), limit: "10" },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

/** The modifiers set on a character itself, which its Modifiers dialog lists. */
export function characterModifiersQuery(characterId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.modifiers(characterId),
    queryFn: () =>
      parseResponse(rpc.api.characters.modifiers[":characterId"].modifiers.$get({ param: { characterId } })),
  });
}
