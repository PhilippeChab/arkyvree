import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import { type ClassSection } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

/**
 * Where a class's copy goes: customizing an inherited class copies it into this ruleset under a new id, and the page
 * moves to the copy's `tab`, unless it has left the class since.
 */
export function useFollowClassCopy(rulesetId: string, tab: ClassSection) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  return (copyId: string, sourceId: string) => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.section(rulesetId, "classes") });
    if (!isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`)) return;
    navigate(`/rulesets/${rulesetId}/classes/${copyId}/${tab}`, { replace: true, state: location.state });
  };
}
