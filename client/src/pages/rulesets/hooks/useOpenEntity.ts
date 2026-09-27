import { isRecord } from "@/client/src/lib/isRecord.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** The router state a ruleset entity's page is opened with. */
interface EntityPageState {
  /** The list to go back to. */
  from?: string;
  /** Set when a copy-on-write moved the page from this entity to its copy. */
  copiedFrom?: string;
}

/** Reads an entity page's router state; anything else in it is ignored. */
export function entityPageState(state: unknown): EntityPageState {
  if (!isRecord(state)) return {};
  return {
    ...(typeof state.from === "string" && { from: state.from }),
    ...(typeof state.copiedFrom === "string" && { copiedFrom: state.copiedFrom }),
  };
}

/** Opens a ruleset entity's page ("feats/:id/customization"), with the current list as its Back. */
export function useOpenEntity(rulesetId: string) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return useCallback(
    (path: string) => navigate(`/rulesets/${rulesetId}/${path}`, { state: { from: pathname + search } satisfies EntityPageState }),
    [navigate, rulesetId, pathname, search],
  );
}
