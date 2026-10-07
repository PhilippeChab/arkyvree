import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import {
  classDetailQuery,
  type ClassSection,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import type { ClassSectionProps } from "./types.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
export function useClassCustomization({ rulesetId, classId, ruleset }: ClassSectionProps, tab: ClassSection) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  return {
    ruleset,
    entityType: "klasses" as const,
    entityId: classId,
    // The class's bonus spells and caster type are properties of it
    queryKeysToInvalidate: [classDetailQuery(rulesetId, classId).queryKey],
    // Customizing an inherited class copies it into this ruleset under a new id: move to the copy, unless the page has
    // left the class since
    onEntityIdChange: (copyId: string, sourceId: string) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.section(rulesetId, "classes") });
      if (!isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`)) return;
      navigate(`/rulesets/${rulesetId}/classes/${copyId}/${tab}`, { replace: true, state: location.state });
    },
  };
}
