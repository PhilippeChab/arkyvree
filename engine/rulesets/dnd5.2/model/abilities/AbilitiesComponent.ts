import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import AbilityRules from "@/engine/rulesets/dnd5.2/rules/AbilityRules.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { stripSeparators } from "@/shared/text.ts";

interface AbilitiesData {
  [key: string]: {
    base: number;
    misc: number;
    readonly modifier: number;
    readonly total: number;
  };
}

/**
 * A character's ability scores: each one's base and misc (what its background's, its feats' and its items' increases
 * add), its total and modifier counted when read.
 */
export default class AbilitiesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly abilities: AbilitiesData = {} as AbilitiesData;

  /**
   * Each ability's name as its ruleset gives it ("Force Points") and its normalized one ("forcepoints"), by its id: no
   * two of a ruleset's share one, which its seeding refuses (`refuseSharedSlugs`).
   */
  private readonly abilityNames: Map<string, { name: string; normalizedName: string }> = new Map();

  /** Each of the character's scores (its `score` links), its ability named as the view names it. */
  override initialize({ scoreLinks }: Pick<LoadedCharacterData, "scoreLinks">, { rulesetData }: RulesetView) {
    const { abilitiesById } = Dnd52View.of(rulesetData);
    for (const { amount, entityId } of scoreLinks) {
      const name = abilitiesById.get(entityId)?.name ?? "Unknown";
      const normalizedName = stripSeparators(name);
      this.abilityNames.set(entityId, { name, normalizedName });

      // The total and the modifier are computed from the parts when read, so they follow every change to them
      this.abilities[normalizedName] = {
        base: amount!,
        misc: 0,
        get total() {
          return this.base + this.misc;
        },
        get modifier() {
          return AbilityRules.computeModifier(this.total);
        },
      };
    }
  }

  getAbilities(): AbilitiesData {
    return this.abilities;
  }

  /**
   * The character's abilities in the order its sheet lists them (`AbilityRules.orderAbilities`): each with its id, its
   * key (its normalized name, which its target paths name: `forcepoints`), its name as its ruleset gives it ("Force
   * Points"), its abbreviation (FOR: `AbilityRules.abbreviate`), and its scores.
   */
  getAbilitiesWithIds() {
    const abilities = [...this.abilityNames].flatMap(([abilityId, { name, normalizedName }]) => {
      const ability = this.abilities[normalizedName];
      if (!ability) return [];
      return [
        { abbreviation: AbilityRules.abbreviate(normalizedName), abilityId, key: normalizedName, name, ...ability },
      ];
    });
    return AbilityRules.orderAbilities(abilities, (ability) => ability.name);
  }

  getAbility(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)];
  }

  getAbilityModifier(abilityName: string) {
    return this.abilities[stripSeparators(abilityName)]?.modifier ?? 0;
  }

  /** An ability's normalized name by its id (as the sheet keys it): none for one the character has no score in. */
  getAbilityName(abilityId: string): string | undefined {
    return this.abilityNames.get(abilityId)?.normalizedName;
  }
}
