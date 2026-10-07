import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { EntityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";

/** Opens a ruleset entity's page ("feats/:id/customization"), with the current list as its Back. */
export function useOpenEntity(rulesetId: string) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (path: string) =>
      navigate(`/rulesets/${rulesetId}/${path}`, { state: { from: pathname + search } satisfies EntityPageState }),
    [navigate, rulesetId, pathname, search],
  );
}
