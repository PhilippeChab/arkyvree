import type { RulesetData } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS, type FeatFieldValues } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Feat } from "@/engine/rulesets/dnd3.5/view/rows.ts";

/** A weapon rule a feat changes, by its field: Weapon Finesse's, Oversized Two-Weapon Fighting's. */
export type WeaponRule = keyof Pick<FeatFieldValues, "oversizedTwoWeaponFighting" | "weaponFinesse">;

/**
 * The feats of a ruleset's view that change a weapon rule (a feat's FEAT_WEAPON_FINESSE,
 * FEAT_OVERSIZED_TWO_WEAPON_FIGHTING), by the rule: derived once and kept with the view (`WeaponRuleFeats.of`), so a
 * build, which settles its weapons before each round, reads only whether its character has them.
 */
export default class WeaponRuleFeats {
  constructor(private readonly rulesetData: RulesetData) {}

  /** The view's feats that change a weapon rule, derived once with it. */
  static of(rulesetData: RulesetData): WeaponRuleFeats {
    return rulesetData.derive(WeaponRuleFeats);
  }

  /** What it derived: each rule's feats, the first time they're read. */
  private readonly built: Partial<Record<WeaponRule, Feat[]>> = {};

  /** The view's feats that change `rule`, by its field: those that hold it true. */
  featsWith(rule: WeaponRule): Feat[] {
    const { field } = FEAT_FIELDS.fields[rule];
    return (this.built[rule] ??= Dnd35View.of(this.rulesetData).feats.filter((feat) => feat.fields[field] === true));
  }
}
