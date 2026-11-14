/** An aptitude as a ruleset's entity: what its rules refuse of an edit. */

import { z } from "zod";

import { type FormBody, RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/pf1/rules/LevelRules.ts";
import type { Aptitude, Pf1Kinds } from "@/engine/rulesets/pf1/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

/** An aptitude as the ruleset has it: the one the rules count on is never deleted, nor renamed where it was made. */
export default class AptitudeEntity extends RulesetEntity<Pf1Kinds, "aptitudes"> {
  /** Its list's filters: a kind's pools (`scope`: the feats', the spells' lists). */
  protected static override readonly listFilters = { scope: z.enum(["feats", "spells"]) };

  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  override readonly type = "aptitudes";

  /**
   * Refuses deleting the aptitude the rules count on: the pool a character's general feats count toward, whatever the
   * ruleset calls it (`LevelRules.generalFeatsPool`).
   */
  protected override checkDelete(aptitude: Aptitude) {
    if (LevelRules.generalFeatsPool(this.rulesetData)?.id !== aptitude.id) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: it can't be deleted`,
    );
  }

  /**
   * Refuses renaming that pool in the ruleset that made it, the rules' own name for it being the one it holds there
   * (a base rules'): a ruleset built on it renames its copy, the rules still knowing the pool by the name it was made
   * under. A new case of its name is no rename to them.
   */
  protected override checkForm(body: FormBody, _given: object, aptitude?: Aptitude) {
    if (!aptitude || stripSeparators(body.name) === stripSeparators(aptitude.name)) return;
    if (LevelRules.generalFeatsPool(this.rulesetData)?.id !== aptitude.id) return;
    const made =
      aptitude.rulesetId === this.view.ruleset.id && this.rulesetData.cow.sourceOf(aptitude.id) === undefined;
    if (!made) return;
    throw new RulesError(
      "unprocessable",
      `${aptitude.name} is the aptitude a character's general feats count toward: the ruleset that made it can't rename it`,
    );
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
}
