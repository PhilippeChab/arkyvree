/**
 * The entity a customization page is about, shared by the page and the row hover prefetches of the ruleset sections so
 * they cache the same shape. Tagged with what holds its customizations, so the page narrows on `holder` instead of casting.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import type { CustomizationPage } from "@/client/src/hooks/index.ts";
import { type EntityRow, entitySegment, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type CustomizedModifier = InferResponseType<
  (typeof rulesetApi)["customization"][":entityType"][":entityId"]["modifiers"][":modifierId"]["$get"],
  200
>;

/**
 * What a customization page is about (`holder`, what holds its customizations), tagged with its type: a kind's entity
 * (a feat, a spell), an owned one, with the kind that owns it (a class's level), or a modifier, whose requirements it
 * holds.
 */
export type CustomizationEntity =
  | { entity: CustomizedModifier; holder: "modifier"; type: "modifiers" }
  | { entity: EntityRow; holder: "entity"; type: string }
  | { entity: OwnedEntity; holder: "owned"; owner: string; type: string };

export type OwnedEntity = InferResponseType<
  (typeof rulesetApi)["entities"][":entityType"]["owned"][":ownedId"]["$get"],
  200
>;

const rulesetApi = rpc.api.rulesets[":id"];

/** A modifier's customization page: its requirements'. */
export const MODIFIER_PAGE: CustomizationPage = { type: "modifiers" };

async function fetchEntity(
  id: string,
  { owner, type }: CustomizationPage,
  entityId: string,
): Promise<CustomizationEntity> {
  if (type === "modifiers") {
    return {
      holder: "modifier",
      type,
      entity: await parseResponse(
        rulesetApi.customization[":entityType"][":entityId"].modifiers[":modifierId"].$get({
          param: { id, entityType: getUrlSegment(type), entityId, modifierId: entityId },
        }),
      ),
    };
  }
  // An owned entity, by its owner's kind
  if (owner) {
    return {
      holder: "owned",
      owner,
      type,
      entity: await parseResponse(
        rulesetApi.entities[":entityType"].owned[":ownedId"].$get({
          param: { id, entityType: entitySegment(getUrlSegment(owner)), ownedId: entityId },
        }),
      ),
    };
  }
  // A kind's entity, through the routes by kind
  return { holder: "entity", type, entity: await readEntityFn(id, type, entityId) };
}

/** The entity, once its page's URL names a page of a type (`page`) and an entity: nothing is asked before. */
export function customizationEntityQuery(rulesetId: string, page: CustomizationPage | undefined, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, page?.type ?? "", entityId),
    queryFn: page && entityId ? () => fetchEntity(rulesetId, page, entityId) : skipToken,
  });
}
