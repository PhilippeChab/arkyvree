import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { parseCustomizationSegment } from "@/shared/customization/entities.ts";
import type { BaseRules } from "@/shared/enums.ts";
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

/** An entity's customization page, on any of its tabs (`/rulesets/:id/feats/:featId/customization/modifiers`): its type's segment. */
const CUSTOMIZATION_PAGE = /^\/rulesets\/[^/]+\/([^/]+)\/[^/]+\/customization(?:[/?#]|$)/;

/** What a page Back goes to is, named in its ruleset's words (`baseRules`): a class, an entity, else the ruleset. */
function backLabel(to: string, baseRules: BaseRules | undefined) {
  const customized = parseCustomizationSegment(CUSTOMIZATION_PAGE.exec(to)?.[1]);
  if (customized) return `Back to ${entityTypeLabel(customized, baseRules)}`;
  return CLASS_PAGE.test(to) ? "Back to Class" : "Back to Ruleset";
}

/**
 * Where an entity page's Back goes, and its name: the list the page was opened from (a ruleset's tab, a class's, another
 * entity's customization tab: its Modifiers' row), else `fallback`; an entity named in its ruleset's words (`baseRules`,
 * once its ruleset is in: a 3.5 power is a "Spell").
 */
export function entityPageBack(state: unknown, fallback: string, baseRules?: BaseRules) {
  const to = entityPageState(state).from ?? fallback;
  return { label: backLabel(to, baseRules), to };
}

/** Reads an entity page's router state; anything else in it is ignored. */
export function entityPageState(state: unknown): EntityPageState {
  if (!isRecord(state)) return {};
  return {
    ...(typeof state.from === "string" && { from: state.from }),
    ...(typeof state.copiedFrom === "string" && { copiedFrom: state.copiedFrom }),
  };
}
