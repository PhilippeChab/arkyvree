/** The equipment section's queries: a character's inventory, and the ruleset's items its add dialog searches and picks. */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { readEntitiesFn, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { EntityKinds } from "@/engine/index.ts";

import { storedGroups } from "./groups.ts";

/**
 * A ruleset's item, as the add dialog lists it: its name and description, and its own fields, its cost and weight
 * among them (at its block's `itemFields`).
 */
export interface RulesetItem {
  description: string | null;
  fields: Readonly<Record<string, unknown>>;
  id: string;
  name: string;
}

/** An item the character carries, with where it's placed: an entry of its inventory. */
export type InventoryEntry = InferResponseType<
  (typeof rpc.api.characters.inventory)[":characterId"]["$get"],
  200
>[number];

/**
 * A ruleset item's details, which the add dialog places a picked item by (`placement`): an item's read, as the engine
 * describes the items kind.
 */
export type RulesetItemDetail = Pick<ReturnType<EntityKinds["items"]["describe"]>, "placement">;

/** The items a character carries, with where each is placed. */
export function characterInventoryQuery(characterId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.inventory(characterId),
    queryFn: () => parseResponse(rpc.api.characters.inventory[":characterId"].$get({ param: { characterId } })),
  });
}

/**
 * Why a slot (`location`, in each of `groups` as the form shows them, from 1) can't take one more of the
 * character's items, the entry edited (`entryId`) aside: the warning an inventory dialog shows, or null. Skipped while
 * no slot is picked.
 */
export function inventoryPlacementQuery(characterId: string, location: string, groups: number[], entryId?: string) {
  const query = { entryId, location, groups: storedGroups(groups).join(",") };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.inventoryPlacement(characterId, query),
    queryFn:
      location === "none"
        ? skipToken
        : () =>
            parseResponse(
              rpc.api.characters.inventory[":characterId"].placement.$get({
                param: { characterId },
                query: { ...query, location },
              }),
            ),
  });
}

/** The ruleset's items (of its inventory's kind, `kind`) the add dialog offers, filtered by what's typed. */
export function itemOptionsQuery(rulesetId: string, kind: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, kind, search),
    queryFn: ({ pageParam }) =>
      readEntitiesFn(rulesetId, kind, { page: pageParam.toString(), limit: "10", search: search || undefined }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * A ruleset item's details (of its inventory's kind, `kind`), which say how it's placed; skipped until one is picked.
 */
export function rulesetItemQuery(rulesetId: string, kind: string, itemId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.item(rulesetId, kind, itemId ?? ""),
    // The items kind's read is its description: its placement, past the row every kind's read has
    queryFn: itemId
      ? async () => (await readEntityFn(rulesetId, kind, itemId)) as unknown as RulesetItemDetail
      : skipToken,
  });
}
