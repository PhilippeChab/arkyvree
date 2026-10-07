import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { ProjectedCharacterLevel } from "@/engine/core/types.ts";
import { include } from "@/server/mixins.ts";
import TargetPaths from "@/server/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import DetailedCharacterDataLoader from "@/server/rulesets/dnd3.5/loading/DetailedCharacterDataLoader.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/engine/types.ts";
import type { Character, KlassLevel, Requirement } from "@/shared/relations.ts";

import CharacterState, { type DataLoader } from "./CharacterState.ts";
import { buildComponents, type Dnd35Components } from "./components.ts";
import { Builds } from "./concerns/Builds.ts";
import { PossessesVirtually } from "./concerns/PossessesVirtually.ts";
import { Validates } from "./concerns/Validates.ts";

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
    characterLevel: ProjectedCharacterLevel,
    requirementGroups: Requirement[][],
  ): boolean {
    // A level a class would add goes after the character's last
    const position = characterLevel.position ?? (this.characterLevels.at(-1)?.position ?? 0) + 1;
    this.components.classes.addProjectedLevel(klassName, klassLevel, { ...characterLevel, position });
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
