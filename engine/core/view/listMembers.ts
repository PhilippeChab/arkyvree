/**
 * A list's members as the ruleset composes them. A ruleset taking several books merges each feat's and spell's copies
 * and each list's copies, and the winning copy takes every copy's links: the link that puts a spell on a list may sit
 * on another book's copy of the spell, or of the list. A query of a list's feats or spells takes these ids, never the
 * stored links.
 */

import type { RulesetData } from "./index.ts";

/** The ids of the ruleset's feats on a list. */
export function getListFeatIds(rulesetData: RulesetData, aptitudeId: string): string[] {
  const listId = rulesetData.canonicalize(aptitudeId);
  return rulesetData.feats
    .filter((feat) => feat.featsAptitudesInRules.some((link) => link.aptitudeId === listId))
    .map((feat) => feat.id);
}

/** The ids of the ruleset's spells on a list, at a level when one is given (on any list when none is). */
export function getListPowerIds(rulesetData: RulesetData, where: { aptitudeId?: string; level?: number }): string[] {
  const listId = where.aptitudeId === undefined ? undefined : rulesetData.canonicalize(where.aptitudeId);
  return rulesetData.powers
    .filter((power) =>
      power.powersAptitudesInRules.some(
        (link) =>
          (listId === undefined || link.aptitudeId === listId) && (where.level == null || link.level === where.level),
      ),
    )
    .map((power) => power.id);
}
