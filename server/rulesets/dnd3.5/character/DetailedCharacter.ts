import { include } from "@/server/mixins.ts";
import CharacterState, { type DataLoader } from "@/server/rulesets/dnd3.5/character/CharacterState.ts";
import { buildComponents, type Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import { Builds } from "@/server/rulesets/dnd3.5/character/concerns/Builds.ts";
import { PossessesVirtually } from "@/server/rulesets/dnd3.5/character/concerns/PossessesVirtually.ts";
import { Validates } from "@/server/rulesets/dnd3.5/character/concerns/Validates.ts";
import TargetPaths from "@/server/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import DetailedCharacterDataLoader from "@/server/rulesets/dnd3.5/loading/DetailedCharacterDataLoader.ts";
import ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/engine/types.ts";
import type { Character, CharacterLevel, KlassLevel, Requirement } from "@/shared/relations.ts";

/** A 3.5 character: its components wired, built and validated by its concerns. */
export default class DetailedCharacter
  extends include(CharacterState, Builds, PossessesVirtually, Validates)
  implements DetailedCharacterInterface
{
  constructor(character: Character) {
    super(character);
    this.targetPaths = new TargetPaths();
    this.modifierEvaluator = new ModifierEvaluator(this.targetPaths, this.sourcesOf);
    this.requirementEvaluator = new RequirementEvaluator(this.targetPaths);
    this.components = buildComponents(this.modifierEvaluator, (totalLevel) => this.countGeneralFeats(totalLevel));
  }

  readonly components: Dnd35Components;

  readonly modifierEvaluator: ModifierEvaluator;

  readonly requirementEvaluator: RequirementEvaluator;

  /** The general feats the character has at its total level (`Dnd35LevelsRules.countGeneralFeats`). */
  protected countGeneralFeats(totalLevel: number): number {
    return Dnd35LevelsRules.countGeneralFeats(totalLevel);
  }

  protected createDataLoader(): DataLoader {
    return new DetailedCharacterDataLoader(this.character);
  }

  evaluateWithProjectedLevel(
    klassName: string,
    klassLevel: KlassLevel,
    characterLevel: CharacterLevel,
    requirementGroups: Requirement[][],
  ): boolean {
    this.components.classes.addProjectedLevel(klassName, klassLevel, characterLevel);
    const result = this.areRequirementsMet(requirementGroups);
    this.components.classes.removeProjectedLevel(klassName);
    return result;
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
}
