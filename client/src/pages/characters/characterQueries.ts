/**
 * Queries of the character pages: the races a new character can take, and how it sets its ability scores; and what a
 * file picked to import is, and what its import answers.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * How a new character sets its ability scores: its ruleset's abilities in its sheets' order, its rules' methods, the
 * scores' bounds, their modifiers.
 */
export type CharacterCreation = InferResponseType<typeof rpc.api.characters.creation.$get, 200>;

/** What importing a character answers: the character created, and the report of what was imported and couldn't be. */
export type CharacterImport = InferResponseType<typeof rpc.api.characters.import.$post, 201>;

/** A way a new character's ability scores are set, which the create dialog runs by its kind. */
export type CreationMethod = CharacterCreation["methods"][number];

/**
 * What a picked character file is, before a ruleset is: the program that saved it, its version, the file's format and
 * its character's rules, the base rules whose rulesets import it, and why none does.
 */
export type ImportFileDescription = InferResponseType<typeof rpc.api.characters.import.source.$post, 200>;

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

/**
 * How a new character of a ruleset sets its ability scores, for its abilities: its methods and bounds only a deploy
 * changes, and its abilities are refreshed with the ruleset (its key is nested under it); none until it's picked.
 */
export function characterCreationQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.characterCreation(rulesetId),
    queryFn: rulesetId ? () => parseResponse(rpc.api.characters.creation.$get({ query: { rulesetId } })) : skipToken,
    staleTime: FOREVER,
  });
}
