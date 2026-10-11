/**
 * Queries of the character pages: the races a new character can take, how it sets its ability scores, and a
 * character's modifiers.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** How a new character sets its ability scores: its rules' methods, the scores' bounds, their modifiers. */
export type CharacterCreation = InferResponseType<typeof rpc.api.characters.creation.$get, 200>;

/** A way a new character's ability scores are set, which the create dialog runs by its kind. */
export type CreationMethod = CharacterCreation["methods"][number];

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
    getNextPageParam: nextPage,
  });
}

/** How a new character of a ruleset sets its ability scores, which only a deploy changes; none until it's picked. */
export function characterCreationQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.creation(rulesetId),
    queryFn: rulesetId ? () => parseResponse(rpc.api.characters.creation.$get({ query: { rulesetId } })) : skipToken,
    staleTime: FOREVER,
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
