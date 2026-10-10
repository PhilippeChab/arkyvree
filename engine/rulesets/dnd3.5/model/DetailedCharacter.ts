import { type DataLoader, Validates } from "@/engine/core/character/index.ts";
import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";
import type { Character, KlassLevel, Requirement } from "@/shared/relations.ts";

import CharacterComponents, { type Dnd35Components } from "./CharacterComponents.ts";
import CharacterState from "./CharacterState.ts";
import { Builds } from "./concerns/Builds.ts";
import { Diagnoses } from "./concerns/Diagnoses.ts";
import { PossessesVirtually } from "./concerns/PossessesVirtually.ts";
import DetailedCharacterDataLoader, { type LoadedCharacterData } from "./loading/DetailedCharacterDataLoader.ts";

/** A 3.5 character: its components wired, built and validated by its concerns, on core's build and validation. */
export default class DetailedCharacter extends include(
  CharacterState,
  Builds,
  Diagnoses,
  PossessesVirtually,
  Validates,
) {
  constructor(character: Character) {
    super(character);
    this.targetPaths = new Dnd35TargetPaths();
    this.modifierEvaluator = new ModifierEvaluator(this.targetPaths, this.sourcesOf);
    this.requirementEvaluator = new RequirementEvaluator(this.targetPaths);
    this.components = CharacterComponents.build(this.modifierEvaluator, (totalLevel) =>
      this.countGeneralFeats(totalLevel),
    );
  }

  readonly components: Dnd35Components;

  readonly modifierEvaluator: ModifierEvaluator;

  readonly requirementEvaluator: RequirementEvaluator;

  /** The general feats the character has at its total level (`LevelRules.countGeneralFeats`). */
  protected countGeneralFeats(totalLevel: number): number {
    return LevelRules.countGeneralFeats(totalLevel);
  }

  protected createDataLoader(): DataLoader<LoadedCharacterData> {
    return new DetailedCharacterDataLoader(this.character);
  }

  getSpellcasting(): { arcane: number; divine: number } {
    return this.components.spellcasting.getSpellcasting();
  }

  getSpellTagLists() {
    return this.components.spellcasting.getSpellTagLists();
  }

  getSpellTags() {
    return this.components.spellcasting.getSpellTags();
  }

  /**
   * Whether the character meets requirement groups with one more level of class `klassName` (`klassLevel`, after its
   * last level), in that class and in its total level: what a class's next level asks of it, without building it again.
   */
  meetsWithNextLevel(klassName: string, klassLevel: KlassLevel, requirementGroups: Requirement[][]): boolean {
    const now = new Date().toISOString();
    const characterLevel = {
      id: crypto.randomUUID(),
      characterId: this.character.id,
      klassLevelId: klassLevel.id,
      hp: 10,
      abilityId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      position: (this.data.characterLevels.at(-1)?.position ?? 0) + 1,
    };
    // The class's level and the character's (`identity.meta.level`, counted from the classes) take it
    this.components.classes.addProjectedLevel(klassName, klassLevel, characterLevel);
    const met = this.areRequirementsMet(requirementGroups);
    this.components.classes.removeProjectedLevel(klassName);
    return met;
  }
}
