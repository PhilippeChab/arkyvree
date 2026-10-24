import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";

import { useClassCopy } from "./useClassCopy.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
export function useClassCustomization({ rulesetId, classId, classType, ruleset, restorable }: ClassSectionProps) {
  const { followCopy, queryKeysToInvalidate } = useClassCopy(rulesetId, classType, classId);
  return {
    ruleset,
    entityType: classType,
    entityId: classId,
    queryKeysToInvalidate,
    followCopy,
    restorable,
  };
}
