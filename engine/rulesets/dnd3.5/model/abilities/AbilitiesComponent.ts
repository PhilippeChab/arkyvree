import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { stripSeparators } from "@/shared/text.ts";

interface AbilitiesData {
  [key: string]: {
    base: number;
    level: number; // Bonus from levels
    misc: number;
    readonly modifier: number;
    readonly total: number;
  };
}

/** A character's ability scores: each one's base, what its levels add and misc, its total and modifier counted when read. */
export default class AbilitiesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly abilities: AbilitiesData = {} as AbilitiesData;

  /** Each ability's name as its ruleset gives it ("Force Points") and its normalized one ("forcepoints"), by its id. */
  private readonly abilityNames: Map<string, { name: string; normalizedName: string }> = new Map();

  /** What the character's race makes of each ability's misc, by the ability's slug: its permanent score keeps it. */
  private raceAdjustments: Readonly<Record<string, number>> = {};

  /** Each of the character's scores, with what its levels' ability increases add. */
  override initialize({
    abilityIncreases,
    characterAbilityScores,
  }: Pick<LoadedCharacterData, "abilityIncreases" | "characterAbilityScores">) {
    // Initialize abilities from the character's ability scores
    for (const { abilityId, name, score } of characterAbilityScores) {
      const normalizedName = stripSeparators(name);
      this.abilityNames.set(abilityId, { name, normalizedName });

      // The total and the modifier are computed from the parts when read, so they follow every change to them
      this.abilities[normalizedName] = {
        base: score,
        level: 0,
        misc: 0,
        get total() {
          return this.base + this.misc + this.level;
        },
        get modifier() {
          return AbilityRules.computeModifier(this.total);
        },
      };
    }

    // Apply the levels' ability increases
    for (const { abilityId, amount } of abilityIncreases) {
      const normalizedName = this.abilityNames.get(abilityId)?.normalizedName;
      if (normalizedName && this.abilities[normalizedName]) this.abilities[normalizedName].level += amount;
    }
  }

  getAbilities(): AbilitiesData {
    return this.abilities;
  }

  /** Each ability, by its normalized name: its id, its name as its ruleset gives it, and its scores. */
  getAbilitiesWithIds() {
    const result: Record<string, AbilitiesData[string] & { abilityId: string; name: string }> = {};

    for (const [abilityId, { name, normalizedName }] of this.abilityNames.entries()) {
      const ability = this.abilities[normalizedName];
      if (ability) result[normalizedName] = { abilityId, name, ...ability };
    }

    return result;
  }

  getAbility(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)];
  }

  getAbilityModifier(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)]?.modifier ?? 0;
  }

  /**
   * The modifier of an ability's base and what its levels add, its misc aside: what a bonded creature's stat block lists
   * its skills at (`SkillsComponent.setStatBlockTotal`).
   */
  getAbilityModifierExcludingMisc(abilityName: string) {
    const ability = this.abilities[stripSeparators(abilityName)];
    if (!ability) return 0;
    return AbilityRules.computeModifier(ability.base + ability.level);
  }

  /** An ability's normalized name by its id (as the sheet keys it): none for one the character has no score in. */
  getAbilityName(abilityId: string): string | undefined {
    return this.abilityNames.get(abilityId)?.normalizedName;
  }

  /**
   * The modifier of an ability's permanent score (`abilityName`): its base, what its levels add and what its race makes
   * of its misc (`setRaceAdjustments`: a half-orc's −2 Intelligence), the rest of its misc (an item's enhancement, a
   * spell's bonus) aside. What the character's skill points and its language picks count.
   */
  getPermanentModifier(abilityName: string): number {
    const slug = stripSeparators(abilityName);
    const ability = this.abilities[slug];
    if (!ability) return 0;
    return AbilityRules.computeModifier(ability.base + ability.level + (this.raceAdjustments[slug] ?? 0));
  }

  /**
   * What the character's race makes of each ability's misc (`adjustments`, by the ability's slug), which its permanent
   * score keeps (`getPermanentModifier`).
   */
  setRaceAdjustments(adjustments: Readonly<Record<string, number>>): void {
    this.raceAdjustments = adjustments;
  }
}
