/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Aptitude } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** An aptitude's form: its name and description. */
interface AptitudeBody {
  description?: string | null;
  name: string;
}

/** What an aptitude's edit may change: the rules count on a pool's name. */
export default class AptitudeEntity extends RulesetEntity<"aptitudes", AptitudeBody> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Aptitude";

  override readonly type = "aptitudes";

  /** Refuses deleting an aptitude the rules count on by name. */
  protected override checkDelete(aptitude: Aptitude) {
    this.checkName(aptitude);
  }

  /** Refuses renaming an aptitude the rules count on by name. */
  protected override checkForm(body: AptitudeBody, aptitude?: Aptitude) {
    if (aptitude) this.checkName(aptitude, body.name);
  }

  /** A form's columns. */
  protected override columnsOf({ description, name }: AptitudeBody) {
    return { description, name };
  }

  /**
   * Refuses renaming the aptitude to `name`, or deleting it without one, when the ruleset's characters count on it by
   * name: the one the general feats count toward, by its slug. A rename that keeps the slug ("general") changes nothing
   * for them.
   */
  private checkName(aptitude: { name: string }, name?: string) {
    const slug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;
    if (stripSeparators(aptitude.name) !== slug) return;
    if (name !== undefined && stripSeparators(name) === slug) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: it can be neither renamed nor deleted`,
    );
  }
}
