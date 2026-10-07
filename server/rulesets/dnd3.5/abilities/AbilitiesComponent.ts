import { CONSTANTS } from "@/server/rulesets/dnd3.5/constants.ts";
import { type CharacterLevel } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type DetailedCharacterComprehensiveAbilities = {
  [key: string]: {
    base: number;
    level: number; // Bonus from levels
    misc: number;
    readonly total: number;
    readonly modifier: number;
  };
};

export default class AbilitiesComponent {
  private readonly detailedCharacterAbilities: DetailedCharacterComprehensiveAbilities =
    {} as DetailedCharacterComprehensiveAbilities;

  // Map abilityId -> normalized ability name for level-up lookups
  private readonly abilityIdToName: Map<string, string> = new Map();

  private computeModifier(total: number): number {
    return Math.floor((total - CONSTANTS.ABILITY_MODIFIER_OFFSET) / CONSTANTS.ABILITY_MODIFIER_DIVISOR);
  }

  getAbilities() {
    return this.detailedCharacterAbilities;
  }

  getAbilitiesWithIds() {
    const result: Record<
      string,
      {
        abilityId: string;
        base: number;
        level: number;
        misc: number;
        total: number;
        modifier: number;
      }
    > = {};

    for (const [abilityId, normalizedName] of this.abilityIdToName.entries()) {
      const ability = this.detailedCharacterAbilities[normalizedName];
      if (ability) {
        result[normalizedName] = { abilityId, ...ability };
      }
    }

    return result;
  }

  getAbility(abilityName: string) {
    return this.detailedCharacterAbilities[stripSeparators(abilityName)];
  }

  getAbilityModifier(abilityName: string) {
    return this.detailedCharacterAbilities[stripSeparators(abilityName)]?.modifier ?? 0;
  }

  // Skill-point budgets count only innate score (base + level-up bumps), not
  // misc bonuses from feats/items/spells.
  getAbilityModifierExcludingMisc(abilityName: string) {
    const ability = this.detailedCharacterAbilities[stripSeparators(abilityName)];
    if (!ability) return 0;
    return this.computeModifier(ability.base + ability.level);
  }

  initialize(characterAbilities: { abilityId: string; name: string; score: number }[], levels: CharacterLevel[]) {
    // Initialize abilities from the character's ability scores
    for (const { abilityId, name, score } of characterAbilities) {
      const normalizedName = stripSeparators(name);
      this.abilityIdToName.set(abilityId, normalizedName);

      const computeModifier = (total: number) => this.computeModifier(total);
      // The total and the modifier are computed from the parts when read, so they follow every change to them
      this.detailedCharacterAbilities[normalizedName] = {
        base: score,
        level: 0,
        misc: 0,
        get total() {
          return this.base + this.misc + this.level;
        },
        get modifier() {
          return computeModifier(this.total);
        },
      };
    }

    // Apply level-up ability increases
    for (const level of levels) {
      if (level.abilityId) {
        const normalizedName = this.abilityIdToName.get(level.abilityId);
        if (normalizedName && this.detailedCharacterAbilities[normalizedName]) {
          this.detailedCharacterAbilities[normalizedName].level += 1;
        }
      }
    }
  }
}
