import type { RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { getEntityTypeOfSegment, getUrlSegment } from "@/shared/urlSegments.ts";

/** The router state a ruleset entity's page is opened with (`useOpenEntity`). */
export interface EntityPageState {
  /** Set when a copy-on-write moved the page from this entity to its copy. */
  copiedFrom?: string;
  /** The list to go back to. */
  from?: string;
}

/** A class's page, on any of its tabs (`/rulesets/:id/classes/:classId/:tab`); the ruleset's Classes tab isn't one. */
const CLASS_PAGE = /^\/rulesets\/[^/]+\/classes\/[^/?#]+/;

/** An entity's customization page, on any of its tabs (`/rulesets/:id/feats/:featId/customization/modifiers`): its type's segment. */
const CUSTOMIZATION_PAGE = /^\/rulesets\/[^/]+\/([^/]+)\/[^/]+\/customization(?:[/?#]|$)/;

/**
 * What a page Back goes to is, named in its ruleset's words (`words`): a class, an entity (just "Back" until its
 * ruleset's words are in), else the ruleset.
 */
function backLabel(to: string, words: RulesWords | undefined) {
  const segment = CUSTOMIZATION_PAGE.exec(to)?.[1];
  const named = segment && getEntityTypeOfSegment(segment);
  const customized = named && getUrlSegment(named) === segment ? named : undefined;
  if (customized) return words?.[customized] ? `Back to ${entityTypeLabel(customized, words)}` : "Back";
  return CLASS_PAGE.test(to) ? "Back to Class" : "Back to Ruleset";
}

/**
 * Where an entity page's Back goes, and its name: the list the page was opened from (a ruleset's tab, a class's, another
 * entity's customization tab: its Modifiers' row), else `fallback`; an entity named in its ruleset's words (`words`,
 * once its rules are in: a 3.5 power is a "Spell").
 */
export function entityPageBack(state: unknown, fallback: string, words?: RulesWords) {
  const to = entityPageState(state).from ?? fallback;
  return { label: backLabel(to, words), to };
}

/** Reads an entity page's router state; anything else in it is ignored. */
export function entityPageState(state: unknown): EntityPageState {
  if (!isRecord(state)) return {};
  return {
    ...(typeof state.from === "string" && { from: state.from }),
    ...(typeof state.copiedFrom === "string" && { copiedFrom: state.copiedFrom }),
  };
}
