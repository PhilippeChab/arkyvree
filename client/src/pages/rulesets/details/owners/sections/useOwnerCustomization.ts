import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";

import { useOwnerCopy } from "./useOwnerCopy.ts";

/** What a customization section of the owner takes: the owner, and where a copy of it goes. */
export function useOwnerCustomization({ rulesetId, ownerId, ownerType, ruleset, restorable }: OwnerSectionProps) {
  const { followCopy, queryKeysToInvalidate } = useOwnerCopy(rulesetId, ownerType, ownerId);
  return {
    ruleset,
    entityType: ownerType,
    entityId: ownerId,
    queryKeysToInvalidate,
    followCopy,
    restorable,
  };
}
