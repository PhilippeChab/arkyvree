import RulesError from "@/engine/core/RulesError.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import type { AptitudesRules } from "@/server/rulesets/engine/module/index.ts";
import { stripSeparators } from "@/shared/text.ts";

export class Dnd35AptitudesRules implements AptitudesRules {
  /**
   * The aptitude the general feats count toward keeps its name, by its slug: every character of the ruleset counts on
   * it. A rename that keeps the slug ("general") is no change to them.
   */
  validateNameKept(aptitude: { name: string }, name?: string): void {
    const slug = Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG;
    if (stripSeparators(aptitude.name) !== slug) return;
    if (name !== undefined && stripSeparators(name) === slug) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: it can be neither renamed nor deleted`,
    );
  }
}
