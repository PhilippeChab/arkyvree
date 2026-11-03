/**
 * The entity a customization page is about, shared by the page and the row hover prefetches of the ruleset sections so
 * they cache the same shape. Tagged with what holds its customizations, so the page narrows on `holder` instead of casting.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import type { CustomizationPage } from "@/client/src/hooks/index.ts";
import { type EntityAnswer, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";

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
  | { entity: CustomizedModifier; holder: "modifier"; type: typeof CUSTOMIZATION_TYPES.modifier }
  | { entity: EntityAnswer; holder: "entity"; type: string }
  | { entity: OwnedEntity; holder: "owned"; owner: string; ownerId: string; type: string };

/**
 * An owned entity as its page reads it (a class's level): as stored (its owner, `ownerId`, and its place on its owner's
 * track, `position`), named by its owner (`name`: a class's, which its page's title reads, "Fighter Level 3"), with
 * whether its delete can be undone from Local Changes (`restorableDelete`, its owner's).
 */
export type OwnedEntity = InferResponseType<
  (typeof rulesetApi)["entities"][":entityType"]["owned"][":ownedId"]["$get"],
  200
>;

const rulesetApi = rpc.api.rulesets[":id"];

/** A modifier's customization page: its requirements'. */
export const MODIFIER_PAGE: CustomizationPage = { type: CUSTOMIZATION_TYPES.modifier };

async function fetchEntity(
  id: string,
  { owner, type }: CustomizationPage,
  entityId: string,
): Promise<CustomizationEntity> {
  if (type === CUSTOMIZATION_TYPES.modifier) {
    return {
      holder: "modifier",
      type,
      entity: await parseResponse(
        rulesetApi.customization[":entityType"][":entityId"].modifiers[":modifierId"].$get({
          param: { id, entityType: type, entityId, modifierId: entityId },
        }),
      ),
    };
  }
  // An owned entity, by its owner's kind, and its owner
  if (owner) {
    const entity = await parseResponse(
      rulesetApi.entities[":entityType"].owned[":ownedId"].$get({
        param: { id, entityType: owner, ownedId: entityId },
      }),
    );
    return { holder: "owned", owner, ownerId: entity.ownerId, type, entity };
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
