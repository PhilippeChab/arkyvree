/** The fields section's picked links' queries: what a character has of a link, and what its picks leave it room for. */

import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** An entity a character's link names, as its picker shows it. */
export type LinkedEntity = LinkRoom["automatic"][number];

/** What a character has of a picked link and may pick, as its ruleset's rules answer it for the picks its form holds. */
export type LinkRoom = InferResponseType<(typeof rpc.api.characters)[":id"]["links"][":link"]["$get"], 200>;

/**
 * What a character has of a picked link (`link`: 3.5's languages) without picking it, its picks (`entityIds`: its
 * form's, as it's edited), and the entities one more pick may add: what the link's picker offers, as its ruleset's
 * rules answer it.
 */
export function characterLinkQuery(characterId: string, link: string, entityIds: string[]) {
  const query = { entityIds: entityIds.join(",") };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.links(characterId, link, query),
    queryFn: () =>
      parseResponse(rpc.api.characters[":id"].links[":link"].$get({ param: { id: characterId, link }, query })),
  });
}
