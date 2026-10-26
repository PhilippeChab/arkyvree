/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import { z } from "zod";

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Aptitude } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

/** What an aptitude's edit may change: the rules count on a pool's name. */
export default class AptitudeEntity extends RulesetEntity<"aptitudes"> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Aptitude";

  /** Its list's filters: a kind's pools (`scope`: the feats', the spells' lists). */
  protected override readonly listFilters = { scope: z.enum(["feats", "spells"]) };

  override readonly type = "aptitudes";

  /** Refuses deleting an aptitude the rules count on by name. */
  protected override checkDelete(aptitude: Aptitude) {
    this.checkName(aptitude);
  }

  /** Refuses renaming an aptitude the rules count on by name. */
  protected override checkForm(body: FormBody, aptitude?: Aptitude) {
    if (aptitude) this.checkName(aptitude, body.name);
  }

  /**
   * A page of the ruleset's aptitudes: a kind's pools when its query says (`scope`: the feats', the spells' lists, those
   * their `listedIn` links name).
   */
  protected override listOf({ scope, ...where }: { childOnly?: boolean; scope?: "feats" | "spells" }) {
    const list = super.listOf(where);
    const linkedBy = scope && { fromType: scope, role: "listedIn" };
    return { ...list, filters: linkedBy ? { ...list.filters, linkedBy } : list.filters };
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
