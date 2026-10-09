/** The equipment section's queries: a character's inventory, and the ruleset's items its add dialog searches and picks. */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** An item the character carries, with where it's placed: an entry of its inventory. */
export type InventoryEntry = InferResponseType<
  (typeof rpc.api.characters.inventory)[":characterId"]["$get"],
  200
>[number];

/** A ruleset's item, as the add dialog lists it. */
export type RulesetItem = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"], 200>["items"][number];

/** A ruleset item's details, which the add dialog places a picked item by. */
export type RulesetItemDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"][":itemId"]["$get"], 200>;

/** The items a character carries, with where each is placed. */
export function characterInventoryQuery(characterId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.inventory(characterId),
    queryFn: () => parseResponse(rpc.api.characters.inventory[":characterId"].$get({ param: { characterId } })),
  });
}

/** A ruleset item's details, which its placement profile reads; skipped until an item is picked. */
export function rulesetItemQuery(rulesetId: string, itemId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.item(rulesetId, itemId ?? ""),
    queryFn: itemId
      ? () => parseResponse(rpc.api.rulesets[":id"].items[":itemId"].$get({ param: { id: rulesetId, itemId } }))
      : skipToken,
  });
}

/** The ruleset's items the add dialog offers, filtered by what's typed. */
export function rulesetItemSearchQuery(rulesetId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "items", search),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].items.$get({
          param: { id: rulesetId },
          query: { page: pageParam.toString(), limit: "10", search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
