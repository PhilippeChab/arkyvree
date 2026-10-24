/**
 * Queries of the character pages: the options a new character's creation picks offer, and how it sets its scores; and
 * what a file picked to import is, and what its import answers.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * How a new character sets its scores of a scored link: the entities it scores in its sheets' order, its rules'
 * methods, the scores' bounds, their modifiers.
 */
export type CharacterCreation = InferResponseType<typeof rpc.api.characters.creation.$get, 200>;

/** What importing a character answers: the character created, and the report of what was imported and couldn't be. */
export type CharacterImport = InferResponseType<typeof rpc.api.characters.import.$post, 201>;

/** A way a new character's scores are set, which the create dialog runs by its kind. */
export type CreationMethod = CharacterCreation["methods"][number];

/**
 * What a picked character file is, before a ruleset is: the program that saved it, its version, the file's format and
 * its character's rules, the base rules whose rulesets import it, and why none does.
 */
export type ImportFileDescription = InferResponseType<typeof rpc.api.characters.import.source.$post, 200>;

/**
 * How a new character of a ruleset sets its scores of a scored link (`link`: 3.5's abilities), for the entities it
 * scores: its methods and bounds only a deploy changes, and its entities are refreshed with the ruleset (its key is
 * nested under it); none until it's picked.
 */
export function characterCreationQuery(rulesetId: string, link: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.characterCreation(rulesetId, link),
    queryFn: rulesetId
      ? () => parseResponse(rpc.api.characters.creation.$get({ query: { link, rulesetId } }))
      : skipToken,
    staleTime: FOREVER,
  });
}

/**
 * The options a ruleset offers a new character's creation pick (`column`: 3.5's race), each marked eligible or not for
 * what the fields that narrow them hold (`narrowing`, by their keys: `""` while unpicked); skipped until a ruleset is
 * picked.
 */
export function creationOptionsQuery(rulesetId: string, column: string, narrowing: Record<string, string>) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.creationOptions(rulesetId, column, narrowing),
    queryFn: rulesetId
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters.creation[":column"].$get({
              param: { column },
              query: {
                rulesetId,
                // A field not set yet narrows nothing
                ...Object.fromEntries(Object.entries(narrowing).filter(([, value]) => value)),
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
