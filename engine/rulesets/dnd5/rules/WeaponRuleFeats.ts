import type { RulesetData } from "@/engine/core/view/index.ts";
import { FEAT_FIELDS, type FeatFieldValues } from "@/engine/rulesets/dnd5/entities/feats/fields.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Feat } from "@/engine/rulesets/dnd5/view/rows.ts";

/** A feat that lets its owner use a weapon's mastery property, and that weapon (its FEAT_WEAPON_MASTERY). */
interface Mastery {
  feat: Feat;
  weapon: string;
}

/** A weapon rule a feat changes, by its field: Martial Arts'. */
export type WeaponRule = keyof Pick<FeatFieldValues, "martialArts">;

/**
 * The feats of a ruleset's view that change a weapon rule (a feat's FEAT_MARTIAL_ARTS), by the rule, and those that
 * master a weapon (a feat's FEAT_WEAPON_MASTERY): derived once and kept with the view (`WeaponRuleFeats.of`), so a
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

  /** The masteries it derived, the first time they're read. */
  private builtMasteries: Mastery[] | undefined;

  /** The view's feats that change `rule`, by its field: those that hold it true. */
  featsWith(rule: WeaponRule): Feat[] {
    const { field } = FEAT_FIELDS.fields[rule];
    return (this.built[rule] ??= Dnd5View.of(this.rulesetData).feats.filter((feat) => feat.fields[field] === true));
  }

  /** The view's feats that master a weapon, each with the weapon it names (Weapon Mastery: Longsword's Longsword). */
  masteries(): Mastery[] {
    const { field } = FEAT_FIELDS.fields.weaponMastery;
    return (this.builtMasteries ??= Dnd5View.of(this.rulesetData).feats.flatMap((feat) => {
      const weapon = feat.fields[field];
      return typeof weapon === "string" && weapon !== "" ? [{ feat, weapon }] : [];
    }));
  }
}
