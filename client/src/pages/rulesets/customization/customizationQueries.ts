/**
 * The rows of a customization's tabs that their section reads itself: an entity's modifiers and requirements (its
 * properties come with the entity, `entityQueries.ts`). The class page's tabs read the same.
 */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizableEntityType, CustomizationOwnerType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

const customizationApi = rpc.api.rulesets[":id"].customization[":entityType"][":entityId"];

/** Where a customization tab's rows are cached, which its saves refresh: `customization-feats-<id>-modifiers`. */
export function customizationSection(
  entityType: CustomizationOwnerType,
  entityId: string,
  tab: "modifiers" | "requirements",
) {
  return `customization-${entityType}-${entityId}-${tab}`;
}

export function modifiersQuery(rulesetId: string, entityType: CustomizableEntityType, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.section(rulesetId, customizationSection(entityType, entityId, "modifiers")),
    queryFn: () =>
      parseResponse(
        customizationApi.modifiers.$get({ param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId } }),
      ),
  });
}

export function requirementsQuery(rulesetId: string, entityType: CustomizationOwnerType, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.section(rulesetId, customizationSection(entityType, entityId, "requirements")),
    queryFn: () =>
      parseResponse(
        customizationApi.requirements.$get({
          param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId },
        }),
      ),
  });
}
