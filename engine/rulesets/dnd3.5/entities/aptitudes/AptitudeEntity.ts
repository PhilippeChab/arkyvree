/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import { PlainEntity } from "@/engine/core/entities/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { stripSeparators } from "@/shared/text.ts";

/** An aptitude's form: its name and description. */
type AptitudeBody = { description?: string | null; name: string };

/** What an aptitude's edit may change: the rules count on a pool's name. */
export default class AptitudeEntity extends PlainEntity<"aptitudes", AptitudeBody> {
  protected readonly label = "Aptitude";

  readonly type = "aptitudes";

  /**
   * Refuses renaming the aptitude to `name`, or deleting it without one, when the ruleset's characters count on it by
   * name: the one the general feats count toward, by its slug. A rename that keeps the slug ("general") changes nothing
   * for them.
   */
  private checkEdit(aptitude: { name: string }, name?: string) {
    const slug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;
    if (stripSeparators(aptitude.name) !== slug) return;
    if (name !== undefined && stripSeparators(name) === slug) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: it can be neither renamed nor deleted`,
    );
  }

  /** A form's columns. */
  protected columnsOf({ description, name }: AptitudeBody) {
    return { description, name };
  }

  /** Deleting an aptitude: the aptitude as the view has it, refused when the rules count on it by name. */
  override planDelete(aptitudeId: string) {
    const plan = super.planDelete(aptitudeId);
    this.checkEdit(plan.entity);
    return plan;
  }

  /** An aptitude's edit: the aptitude as the view has it, and its new row, refused when the rules count on its name. */
  override planEdit(aptitudeId: string, body: AptitudeBody) {
    const plan = super.planEdit(aptitudeId, body);
    this.checkEdit(plan.entity, body.name);
    return plan;
  }
}
