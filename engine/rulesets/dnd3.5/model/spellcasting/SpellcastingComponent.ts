import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
} from "@/engine/rulesets/dnd3.5/model/loading/CustomizedEntities.ts";
import { include } from "@/lib/mixins.ts";
import type { CharacterLevel, Modifier } from "@/shared/relations.ts";
import { BONUS_SPELL_MODIFIER_STEP, MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

import { BonusCasterLevels } from "./concerns/BonusCasterLevels.ts";
import { KnownPowers } from "./concerns/KnownPowers.ts";
import SpellcastingState from "./SpellcastingState.ts";
import SpellLists from "./SpellLists.ts";

/** What a character's spellcasting's finish reads of its loaded data: its levels, feats, powers and classes' maps. */
type SpellcastingCharacter = {
  characterLevels: CharacterLevel[];
  feats: CustomizedFeat[];
  klassBonusSpellAbilityMap: Map<string, string>;
  klassLevels: CustomizedClassLevel[];
  powers: CustomizedPower[];
};

/**
 * A character's spellcasting: its classes' spell lists and caster types (`initialize`), and, once its modifiers apply,
 * what they leave it (`finalize`): its bonus caster levels' slots, its bonus spells, its known spells and its tags. The
 * highest spell levels it casts are counted when read (`getSpellcasting`).
 */
class SpellcastingComponent extends include(SpellcastingState, BonusCasterLevels, KnownPowers) {
  /** The bonus spells a class's spellcasting ability gives: each spell level its modifier reaches adds uses. */
  private applyBonusSpells(klassBonusSpellAbilityMap: Map<string, string>) {
    const characterClasses = this.classes.getCharacterClasses();
    const aptitudes = this.aptitudes.getAptitudes();

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const abilityName = klassBonusSpellAbilityMap.get(klassData.klass.id);
      if (!abilityName) continue;

      const abilityMod = this.abilities.getAbilityModifier(abilityName);
      if (abilityMod <= 0) continue;

      // Each of its lists: one it has no slot in (a pious templar's other list) has none to add to
      for (const aptitudeKey of this.spellListsOf(className)) {
        const aptitude = aptitudes[aptitudeKey];
        if (!aptitude || !this.aptitudes.isLeveledAptitude(aptitudeKey)) continue;

        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let spellLevel = 1; spellLevel <= MAX_SPELL_LEVEL; spellLevel++) {
          const levelData = aptitudeObj[String(spellLevel)] as AptitudeLevelData | undefined;
          if (!levelData || levelData.allowed === 0) continue;
          if (abilityMod < spellLevel) continue;

          const bonusSpells = Math.floor((abilityMod - spellLevel) / BONUS_SPELL_MODIFIER_STEP) + 1;
          levelData.uses += bonusSpells;
        }
      }
    }
  }

  /**
   * What the character's modifiers leave its spellcasting, in order: the slots its bonus caster levels give (each while
   * its gate holds, `isGateMet`: it takes the targets to count as met), the bonus spells its abilities give, the spells
   * its lists make it know, and its spell tags.
   */
  finalize(
    rulesetData: RulesetData,
    components: Components,
    character: SpellcastingCharacter,
    isGateMet: (modifier: Modifier, metTargets?: string[]) => boolean,
  ) {
    const { characterLevels, feats, klassBonusSpellAbilityMap, klassLevels, powers } = character;
    const spellLists = SpellLists.of(rulesetData);
    this.readBonusCasterLevels(rulesetData, klassLevels, feats, characterLevels, rulesetData.klasses);
    this.applyBonusCasterLevels(components, feats, spellLists.featListIds, isGateMet);
    this.applyBonusSpells(klassBonusSpellAbilityMap);
    this.collectAptitudePowers(rulesetData, powers);
    this.enrichAllKnownPowers(rulesetData, powers, klassBonusSpellAbilityMap);
    this.buildSpellTags(feats, spellLists.featListIds);
  }

  /** The highest arcane and divine spell levels the character casts: the `spellcasting` component's, its target paths'. */
  getSpellcasting(): { readonly arcane: number; readonly divine: number } {
    return this.casterLevels;
  }

  /** Each class's spell lists, off the ruleset's levels' slots, and its caster type (`klassCasterTypeMap`). */
  initialize(rulesetData: RulesetData, klassCasterTypeMap: Map<string, "Arcane" | "Divine">) {
    this.classListsByKlassId = SpellLists.of(rulesetData).classListsByKlass;
    this.casterTypeByKlassId = klassCasterTypeMap;
  }
}

export default SpellcastingComponent;
