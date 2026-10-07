import { isRecord } from "@/shared/isRecord.ts";

/** The router state a ruleset entity's page is opened with (`useOpenEntity`). */
export interface EntityPageState {
  /** Set when a copy-on-write moved the page from this entity to its copy. */
  copiedFrom?: string;
  /** The list to go back to. */
  from?: string;
}

/** A class's page, on any of its tabs (`/rulesets/:id/classes/:classId/levels`); the ruleset's Classes tab isn't one. */
const CLASS_PAGE = /^\/rulesets\/[^/]+\/classes\/[^/?#]+/;

/**
 * Where an entity page's Back goes, and its name: the list the page was opened from (a ruleset's tab, a class's), else
 * `fallback`.
 */
export function entityPageBack(state: unknown, fallback: string) {
  const to = entityPageState(state).from ?? fallback;
  return { label: CLASS_PAGE.test(to) ? "Back to Class" : "Back to Ruleset", to };
}

/** Reads an entity page's router state; anything else in it is ignored. */
export function entityPageState(state: unknown): EntityPageState {
  if (!isRecord(state)) return {};
  return {
    ...(typeof state.from === "string" && { from: state.from }),
    ...(typeof state.copiedFrom === "string" && { copiedFrom: state.copiedFrom }),
  };
}
