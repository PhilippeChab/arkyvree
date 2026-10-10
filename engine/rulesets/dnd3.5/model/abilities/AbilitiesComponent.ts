import { type CharacterLevel } from "@/shared/relations.ts";
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

/** What an ability's score, less its offset, is halved by into its modifier, rounded down. */
const ABILITY_MODIFIER_DIVISOR = 2;

/** The score an ability's modifier is 0 at. */
const ABILITY_MODIFIER_OFFSET = 10;

export default class AbilitiesComponent {
  /** An ability's modifier at a score: +1 for every 2 points above 10, rounded down (a score of 9 is -1). */
  static computeModifier(score: number): number {
    return Math.floor((score - ABILITY_MODIFIER_OFFSET) / ABILITY_MODIFIER_DIVISOR);
  }

  private readonly abilities: AbilitiesData = {} as AbilitiesData;

  // Map abilityId -> normalized ability name for level-up lookups
  private readonly abilityIdToName: Map<string, string> = new Map();

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
    return AbilitiesComponent.computeModifier(ability.base + ability.level);
  }

  /** An ability's name by its id (as the sheet keys it): none for one the character has no score in. */
  getAbilityName(abilityId: string): string | undefined {
    return this.abilityIdToName.get(abilityId);
  }

  initialize(characterAbilities: { abilityId: string; name: string; score: number }[], levels: CharacterLevel[]) {
    // Initialize abilities from the character's ability scores
    for (const { abilityId, name, score } of characterAbilities) {
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
          return AbilitiesComponent.computeModifier(this.total);
        },
      };
    }

    // Apply level-up ability increases
    for (const level of levels) {
      if (level.abilityId) {
        const normalizedName = this.abilityIdToName.get(level.abilityId);
        if (normalizedName && this.abilities[normalizedName]) this.abilities[normalizedName].level += 1;
      }
    }
  }
}
