import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useCopyOnWrite } from "@/client/src/pages/rulesets/hooks/index.ts";

import type { ClassSectionProps } from "./classSections.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
export function useClassCustomization({ rulesetId, classId, ruleset, restorable }: ClassSectionProps) {
  return {
    ruleset,
    entityType: "klasses" as const,
    entityId: classId,
    // The class's bonus spells and caster type are properties of it, and a copy of it takes its place in the list
    queryKeysToInvalidate: [
      classDetailQuery(rulesetId, classId).queryKey,
      QUERY_KEYS.rulesets.section(rulesetId, "classes"),
    ],
    onEntityIdChange: useCopyOnWrite(rulesetId, classId, (id) => `classes/${id}`).followCopy,
    restorable,
  };
}
