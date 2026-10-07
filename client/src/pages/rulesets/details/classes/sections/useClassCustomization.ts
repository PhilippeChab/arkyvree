import {
  classDetailQuery,
  type ClassSection,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import type { ClassSectionProps } from "./types.ts";
import { useFollowClassCopy } from "./useFollowClassCopy.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
export function useClassCustomization({ rulesetId, classId, ruleset }: ClassSectionProps, tab: ClassSection) {
  return {
    ruleset,
    entityType: "klasses" as const,
    entityId: classId,
    // The class's bonus spells and caster type are properties of it
    queryKeysToInvalidate: [classDetailQuery(rulesetId, classId).queryKey],
    onEntityIdChange: useFollowClassCopy(rulesetId, tab),
  };
}
