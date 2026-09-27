/**
 * The entity a customization page is about, shared by the page and the row
 * hover prefetches of the ruleset sections so they cache the same shape.
 * Tagged with its type, so the page narrows on `type` instead of casting.
 */
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { EntityType } from "./types.ts";

const rulesetApi = rpc.api.rulesets[":id"];

export type Feat = InferResponseType<(typeof rulesetApi)["feats"][":featId"]["$get"], 200>;
export type Race = InferResponseType<(typeof rulesetApi)["races"][":raceId"]["$get"], 200>;
export type Item = InferResponseType<(typeof rulesetApi)["items"][":itemId"]["$get"], 200>;
export type Power = InferResponseType<(typeof rulesetApi)["powers"][":powerId"]["$get"], 200>;
export type ClassLevel = InferResponseType<(typeof rulesetApi)["class_levels"][":classLevelId"]["$get"], 200>;
export type Klass = InferResponseType<(typeof rulesetApi)["classes"][":classId"]["$get"], 200>;
export type CustomizedModifier = InferResponseType<
  (typeof rulesetApi)["customization"][":entityType"][":entityId"]["modifiers"][":modifierId"]["$get"],
  200
>;

export type CustomizationEntity =
  | { type: "feats"; entity: Feat }
  | { type: "races"; entity: Race }
  | { type: "items"; entity: Item }
  | { type: "powers"; entity: Power }
  | { type: "klass_levels"; entity: ClassLevel }
  | { type: "klasses"; entity: Klass }
  | { type: "modifiers"; entity: CustomizedModifier };

async function fetchEntity(id: string, type: EntityType, entityId: string): Promise<CustomizationEntity> {
  switch (type) {
    case "feats":
      return { type, entity: await parseResponse(rulesetApi.feats[":featId"].$get({ param: { id, featId: entityId } })) };
    case "races":
      return { type, entity: await parseResponse(rulesetApi.races[":raceId"].$get({ param: { id, raceId: entityId } })) };
    case "items":
      return { type, entity: await parseResponse(rulesetApi.items[":itemId"].$get({ param: { id, itemId: entityId } })) };
    case "powers":
      return { type, entity: await parseResponse(rulesetApi.powers[":powerId"].$get({ param: { id, powerId: entityId } })) };
    case "klass_levels":
      return {
        type,
        entity: await parseResponse(rulesetApi.class_levels[":classLevelId"].$get({ param: { id, classLevelId: entityId } })),
      };
    case "klasses":
      return { type, entity: await parseResponse(rulesetApi.classes[":classId"].$get({ param: { id, classId: entityId } })) };
    case "modifiers":
      return {
        type,
        entity: await parseResponse(rulesetApi.customization[":entityType"][":entityId"].modifiers[":modifierId"].$get({
          param: { id, entityType: type, entityId, modifierId: entityId },
        })),
      };
  }
}

export const customizationEntityQuery = (rulesetId: string, type: EntityType, entityId: string) => queryOptions({
  queryKey: queryKeys.rulesets.entity(rulesetId, type, entityId),
  queryFn: () => fetchEntity(rulesetId, type, entityId),
});
