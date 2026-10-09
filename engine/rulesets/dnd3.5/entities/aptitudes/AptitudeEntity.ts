/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { stripSeparators } from "@/shared/text.ts";

/** What an aptitude's edit may change: the rules count on a pool's name. */
export default class AptitudeEntity {
  /**
   * Refuses renaming the aptitude to `name`, or deleting it without one, when the ruleset's characters count on it by
   * name: the one the general feats count toward, by its slug. A rename that keeps the slug ("general") changes nothing
   * for them.
   */
  private static checkEdit(aptitude: { name: string }, name?: string) {
    const slug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;
    if (stripSeparators(aptitude.name) !== slug) return;
    if (name !== undefined && stripSeparators(name) === slug) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: it can be neither renamed nor deleted`,
    );
  }

  /** An aptitude as the view has it: refused when there's none of its id. */
  private static find(view: RulesetView, aptitudeId: string) {
    const aptitude = view.rulesetData.find("aptitudes", aptitudeId);
    if (!aptitude) throw new RulesError("not-found", "Aptitude not found in this ruleset");
    return aptitude;
  }

  /** Deleting an aptitude: the aptitude as the view has it, refused when the rules count on it by name. */
  static planDelete(view: RulesetView, aptitudeId: string) {
    const aptitude = AptitudeEntity.find(view, aptitudeId);
    AptitudeEntity.checkEdit(aptitude);
    return { aptitude };
  }

  /** An aptitude's edit to `name`: the aptitude as the view has it, refused when the rules count on its name. */
  static planEdit(view: RulesetView, aptitudeId: string, name: string) {
    const aptitude = AptitudeEntity.find(view, aptitudeId);
    AptitudeEntity.checkEdit(aptitude, name);
    return { aptitude };
  }
}
