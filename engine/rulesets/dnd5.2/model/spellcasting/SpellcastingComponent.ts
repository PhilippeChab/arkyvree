import type { BuiltCharacter } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd5.2/rules/SpellLists.ts";
import { include } from "@/lib/mixins.ts";

import { KnownSpells } from "./concerns/KnownSpells.ts";
import SpellcastingState, { type CastingLevels } from "./SpellcastingState.ts";

/**
 * A character's spellcasting: its spell slots and caster levels, counted when read (`getSpellcasting`), and the spells
 * its lists know, with their DCs, once the modifiers have applied (`finalize`).
 */
class SpellcastingComponent extends include(SpellcastingState, KnownSpells) {
  /** The spells its lists know, picked, granted or given by a modifier, with their DCs, and their tags. */
  override finalize(
    {
      feats,
      classSpellcastingAbilityMap,
      spells,
    }: Pick<LoadedCharacterData, "feats" | "classSpellcastingAbilityMap" | "spells">,
    { rulesetData }: RulesetView,
    character: BuiltCharacter,
  ) {
    const { appliedModifiers } = character.modifierEvaluator.getModifiers();
    this.collectAptitudeSpells(rulesetData, spells, appliedModifiers);
    this.enrichAllKnownSpells(rulesetData, spells, classSpellcastingAbilityMap, appliedModifiers);
    this.buildSpellTags(feats, SpellLists.of(rulesetData).featListIds);
  }

  /** Its classes' spell lists and caster types. */
  override initialize(
    { classCasterTypeMap }: Pick<LoadedCharacterData, "classCasterTypeMap">,
    { rulesetData }: RulesetView,
  ) {
    this.classListsByClassId = SpellLists.of(rulesetData).classListsByClass;
    this.casterTypeByClassId = classCasterTypeMap;
  }

  /** Its caster levels and spell slots: the `spellcasting` component's, its target paths'. */
  getSpellcasting(): CastingLevels {
    return this.castingLevels;
  }
}

export default SpellcastingComponent;
