/**
 * The entity a customization page is about, shared by the page and the row hover prefetches of the ruleset sections so
 * they cache the same shape. Tagged with its type, so the page narrows on `type` instead of casting.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { type EntityRow, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizationPageType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type CustomizedModifier = InferResponseType<
  (typeof rulesetApi)["customization"][":entityType"][":entityId"]["modifiers"][":modifierId"]["$get"],
  200
>;

export type ClassLevel = InferResponseType<(typeof rulesetApi)["class-levels"][":classLevelId"]["$get"], 200>;
export type CustomizationEntity =
  | { entity: EntityRow; type: CustomizedKind }
  | { entity: ClassLevel; type: "klass_levels" }
  | { entity: CustomizedModifier; type: "modifiers" };

/** A kind of entity whose row opens its customization page (a feat, a race, an item, a spell): read by its kind. */
export type CustomizedKind = Exclude<CustomizationPageType, "klass_levels" | "modifiers">;

const rulesetApi = rpc.api.rulesets[":id"];

async function fetchEntity(id: string, type: CustomizationPageType, entityId: string): Promise<CustomizationEntity> {
  switch (type) {
    case "klass_levels":
      return {
        type,
        entity: await parseResponse(
          rulesetApi["class-levels"][":classLevelId"].$get({ param: { id, classLevelId: entityId } }),
        ),
      };
    case "modifiers":
      return {
        type,
        entity: await parseResponse(
          rulesetApi.customization[":entityType"][":entityId"].modifiers[":modifierId"].$get({
            param: { id, entityType: getUrlSegment(type), entityId, modifierId: entityId },
          }),
        ),
      };
    default:
      // A kind's entity, through the routes by kind
      return { type, entity: await readEntityFn(id, type, entityId) };
  }
}

/** The entity, once its page's URL names a type it customizes (`type`) and an entity: nothing is asked before. */
export function customizationEntityQuery(rulesetId: string, type: CustomizationPageType | undefined, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type ?? "", entityId),
    queryFn: type && entityId ? () => fetchEntity(rulesetId, type, entityId) : skipToken,
  });
}
