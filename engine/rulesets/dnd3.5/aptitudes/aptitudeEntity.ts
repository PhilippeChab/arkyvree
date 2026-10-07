/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Refuses renaming the aptitude to `name`, or deleting it without one, when the ruleset's characters count on it by
 * name: the one the general feats count toward, by its slug. A rename that keeps the slug ("general") changes nothing
 * for them.
 */
export function checkAptitudeEdit(_view: RulesetView, aptitude: { name: string }, name?: string) {
  const slug = Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG;
  if (stripSeparators(aptitude.name) !== slug) return;
  if (name !== undefined && stripSeparators(name) === slug) return;
  throw new RulesError(
    "unprocessable",
    `${aptitude.name} is the aptitude a character's general feats count toward: it can be neither renamed nor deleted`,
  );
}
