import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";
import { stripSeparators } from "@/shared/text.ts";

type AbilitiesData = {
  [key: string]: {
    base: number;
    level: number; // Bonus from levels
    misc: number;
    readonly modifier: number;
    readonly total: number;
  };
};

/** A character's ability scores: each one's base, what its levels add and misc, its total and modifier counted when read. */
export default class AbilitiesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly abilities: AbilitiesData = {} as AbilitiesData;

  // Map abilityId -> normalized ability name for level-up lookups
  private readonly abilityIdToName: Map<string, string> = new Map();

  /** Each of the character's scores, with what its levels' ability increases add. */
  override initialize({
    abilityIncreases,
    characterAbilityScores,
  }: Pick<LoadedCharacterData, "abilityIncreases" | "characterAbilityScores">) {
    // Initialize abilities from the character's ability scores
    for (const { abilityId, name, score } of characterAbilityScores) {
      const normalizedName = stripSeparators(name);
      this.abilityIdToName.set(abilityId, normalizedName);

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
      const normalizedName = this.abilityIdToName.get(abilityId);
      if (normalizedName && this.abilities[normalizedName]) this.abilities[normalizedName].level += amount;
    }
  }

  getAbilities(): AbilitiesData {
    return this.abilities;
  }

  getAbilitiesWithIds() {
    const result: Record<
      string,
      {
        abilityId: string;
        base: number;
        level: number;
        misc: number;
        modifier: number;
        total: number;
      }
    > = {};

    for (const [abilityId, normalizedName] of this.abilityIdToName.entries()) {
      const ability = this.abilities[normalizedName];
      if (ability) result[normalizedName] = { abilityId, ...ability };
    }

    return result;
  }

  getAbility(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)];
  }

  getAbilityModifier(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)]?.modifier ?? 0;
  }

  // Skill-point budgets count only innate score (base + level-up bumps), not
  // misc bonuses from feats/items/spells.
  getAbilityModifierExcludingMisc(abilityName: string) {
    const ability = this.abilities[stripSeparators(abilityName)];
    if (!ability) return 0;
    return AbilityRules.computeModifier(ability.base + ability.level);
  }

  /** An ability's name by its id (as the sheet keys it): none for one the character has no score in. */
  getAbilityName(abilityId: string): string | undefined {
    return this.abilityIdToName.get(abilityId);
  }
}
