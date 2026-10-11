import type { BuiltCharacter } from "@/engine/core/character/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import { include } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";
import { BONUS_SPELL_MODIFIER_STEP, MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

import { BonusCasterLevels } from "./concerns/BonusCasterLevels.ts";
import { KnownPowers } from "./concerns/KnownPowers.ts";
import SpellcastingState, { type CastingLevels } from "./SpellcastingState.ts";

/**
 * A character's spellcasting: its classes' spell lists and caster types (`initialize`), and, once its modifiers apply,
 * what they leave it (`finalize`): its bonus caster levels' slots, its bonus spells, its known spells and its tags. The
 * highest spell levels it casts and its highest caster levels are counted when read (`getSpellcasting`).
 */
class SpellcastingComponent extends include(SpellcastingState, BonusCasterLevels, KnownPowers) {
  /**
   * What the character's modifiers leave its spellcasting, in order: the slots its bonus caster levels give (each while
   * its gate holds, `isGateMet`), the bonus spells its abilities give, the spells its lists make it know, and its spell
   * tags.
   */
  override finalize(
    {
      characterLevels,
      feats,
      klassBonusSpellAbilityMap,
      klassLevels,
      powers,
    }: Pick<LoadedCharacterData, "characterLevels" | "feats" | "klassBonusSpellAbilityMap" | "klassLevels" | "powers">,
    { rulesetData }: RulesetView,
    character: BuiltCharacter,
  ) {
    const spellLists = SpellLists.of(rulesetData);
    const isGateMet = (modifier: Modifier, metTargets?: string[]) =>
      this.isGateMet(character, rulesetData, modifier, metTargets);
    this.readBonusCasterLevels(rulesetData, klassLevels, feats, characterLevels, rulesetData.klasses);
    this.applyBonusCasterLevels(character, feats, spellLists.featListIds, isGateMet);
    this.applyBonusSpells(klassBonusSpellAbilityMap);
    // The modifiers applied once the bonus caster levels' have: what the lists the character knows read
    const { appliedModifiers } = character.modifierEvaluator.getModifiers();
    this.collectAptitudePowers(rulesetData, powers, appliedModifiers);
    this.enrichAllKnownPowers(rulesetData, powers, klassBonusSpellAbilityMap, appliedModifiers);
    this.buildSpellTags(feats, spellLists.featListIds);
  }

  /** Each class's spell lists, off the ruleset's levels' slots, and its caster type (`klassCasterTypeMap`). */
  override initialize(
    { klassCasterTypeMap }: Pick<LoadedCharacterData, "klassCasterTypeMap">,
    { rulesetData }: RulesetView,
  ) {
    this.classListsByKlassId = SpellLists.of(rulesetData).classListsByKlass;
    this.casterTypeByKlassId = klassCasterTypeMap;
  }

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
   * Whether a modifier's own requirements hold on the built character's sheet (`character`), the targets `metTargets`
   * names counted as met: as one any value meets, a class's level gate, which its spell levels replace.
   */
  private isGateMet(
    character: BuiltCharacter,
    rulesetData: RulesetData,
    modifier: Modifier,
    metTargets: string[] = [],
  ) {
    return character.areRequirementsMet([
      (rulesetData.requirementsByEntity.get(modifier.id) ?? []).map((requirement) =>
        requirement.target && metTargets.includes(requirement.target)
          ? { ...requirement, operator: "greater_than_or_equal", value: "0", valueType: "number" }
          : requirement,
      ),
    ]);
  }

  /**
   * The highest arcane and divine spell levels the character casts, and its highest caster level, of either kind and
   * arcane: the `spellcasting` component's, its target paths'.
   */
  getSpellcasting(): CastingLevels {
    return this.castingLevels;
  }
}

export default SpellcastingComponent;
