import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";

import { useClassCopy } from "./useClassCopy.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
export function useClassCustomization({ rulesetId, classId, ruleset, restorable }: ClassSectionProps) {
  const { followCopy, queryKeysToInvalidate } = useClassCopy(rulesetId, classId);
  return {
    ruleset,
    entityType: "klasses" as const,
    entityId: classId,
    queryKeysToInvalidate,
    onEntityIdChange: followCopy,
    restorable,
  };
}
