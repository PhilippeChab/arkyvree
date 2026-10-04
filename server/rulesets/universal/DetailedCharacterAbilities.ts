import { CONSTANTS } from "@/server/rulesets/constants.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { type CharacterLevel, type RulesetAbility } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_PATHS = [
  { path: "base", description: "Base score before modifiers", type: "number" as const, requirementOnly: true },
  { path: "misc", description: "From feats, items, and spells", type: "number" as const },
  { path: "total", description: "Final score after all bonuses", type: "number" as const, requirementOnly: true },
  { path: "modifier", description: "Derived from total score", type: "number" as const, requirementOnly: true },
];

type DetailedCharacterComprehensiveAbilities = {
  [key: string]: {
    base: number;
    level: number; // Bonus from levels
    misc: number;
    total: number;
    modifier: number;
  };
};

export default class DetailedCharacterAbilities {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS);
  }

  static generateTargetPaths(abilities: RulesetAbility[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const ability of abilities) {
      const normalizedAbilityName = stripSeparators(ability.name);

      for (const subPath of NAVIGATABLE_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `abilities.${normalizedAbilityName}.${subPath.path}`,
          category: "abilities",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    paths.push({
      path: "abilities.*.misc",
      category: "abilities",
      description: "Misc bonus applied to every ability",
      groupDescription: kind === "requirement" ? "Any ability" : "All abilities",
      valueType: "number",
      operators: getNumericOperators(kind),
    });

    return paths;
  }

  private readonly detailedCharacterAbilities: DetailedCharacterComprehensiveAbilities =
    {} as DetailedCharacterComprehensiveAbilities;

  // Map abilityId -> normalized ability name for level-up lookups
  private readonly abilityIdToName: Map<string, string> = new Map();

  private computeModifier(total: number): number {
    return Math.floor((total - CONSTANTS.ABILITY_MODIFIER_OFFSET) / CONSTANTS.ABILITY_MODIFIER_DIVISOR);
  }

  initialize(characterAbilities: { abilityId: string; name: string; score: number }[], levels: CharacterLevel[]) {
    // Initialize abilities from the character's ability scores
    for (const { abilityId, name, score } of characterAbilities) {
      const normalizedName = stripSeparators(name);
      this.abilityIdToName.set(abilityId, normalizedName);

      this.detailedCharacterAbilities[normalizedName] = {
        base: score,
        level: 0,
        misc: 0,
        total: score,
        modifier: this.computeModifier(score),
      };
    }

    // Apply level-up ability increases
    for (const level of levels) {
      if (level.abilityId) {
        const normalizedName = this.abilityIdToName.get(level.abilityId);
        if (normalizedName && this.detailedCharacterAbilities[normalizedName]) {
          this.detailedCharacterAbilities[normalizedName].level += 1;
          this.updateTotal(normalizedName);
        }
      }
    }
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

  updateTotal(abilityName: string): void {
    const normalizedAbility = stripSeparators(abilityName);
    const ability = this.detailedCharacterAbilities[normalizedAbility];
    ability.total = ability.base + ability.misc + ability.level;
    ability.modifier = this.computeModifier(ability.total);
  }

  updateTotals(): void {
    for (const ability of Object.keys(this.detailedCharacterAbilities)) {
      this.updateTotal(ability);
    }
  }
}
