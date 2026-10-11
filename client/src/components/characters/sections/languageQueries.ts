/** The identity section's languages query: what a character speaks, and the languages its picks leave it room for. */

import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A language, as a character's languages name it. */
export type CharacterLanguage = CharacterLanguages["automatic"][number];

/** What a character speaks and may pick, as its ruleset's rules answer it for the picks its form holds. */
export type CharacterLanguages = InferResponseType<(typeof rpc.api.characters)[":id"]["languages"]["$get"], 200>;

/**
 * What a character speaks without picking it, its picks (`languageIds`: its form's, as it's edited), and the languages
 * one more pick may add: what its languages picker offers, as its ruleset's rules answer it.
 */
export function characterLanguagesQuery(characterId: string, languageIds: string[]) {
  const query = { languageIds: languageIds.join(",") };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.languages(characterId, query),
    queryFn: () => parseResponse(rpc.api.characters[":id"].languages.$get({ param: { id: characterId }, query })),
  });
}
