import { useLocation, useNavigate } from "react-router-dom";

import type { EntityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";

/** Opens a ruleset entity's page (its path, `buildEntityPagePath`), with the current list as its Back. */
export function useOpenEntity() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return (path: string) => navigate(path, { state: { from: pathname + search } satisfies EntityPageState });
}
