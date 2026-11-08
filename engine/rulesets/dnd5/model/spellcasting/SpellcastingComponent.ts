import type { BuiltCharacter } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5/model/loading/DetailedCharacterDataLoader.ts";
import SpellLists from "@/engine/rulesets/dnd5/rules/SpellLists.ts";
import { include } from "@/lib/mixins.ts";

import { KnownSpells } from "./concerns/KnownSpells.ts";
import SpellcastingState, { type CastingLevels } from "./SpellcastingState.ts";

/**
 * A character's spellcasting: its spell slots and caster levels, counted when read (`getSpellcasting`), and the spells
 * its lists know, with their DCs, once the modifiers have applied (`finalize`): a spell picked at a class that doesn't
 * cast from its list with the list's ability when a modifier sets one (Magic Initiate's pick).
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
    this.applyListAbilities(rulesetData, spells, feats, appliedModifiers);
    this.buildSpellTags(feats, SpellLists.of(rulesetData).featListIds);
  }

  /** Its classes' spell lists, and how each class's levels count toward a multiclass's slots. */
  override initialize(
    { classMulticlassSlotsMap }: Pick<LoadedCharacterData, "classMulticlassSlotsMap">,
    { rulesetData }: RulesetView,
  ) {
    this.classListsByClassId = SpellLists.of(rulesetData).classListsByClass;
    this.multiclassSlotsByClassId = classMulticlassSlotsMap;
  }

  /** Its caster levels, its spell slots and its Pact Magic: the `spellcasting` component's, its target paths'. */
  getSpellcasting(): CastingLevels {
    return this.castingLevels;
  }
}

export default SpellcastingComponent;
