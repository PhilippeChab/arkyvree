import ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";
import type { Character, KlassLevel, Requirement } from "@/shared/relations.ts";

import CharacterComponents, { type Dnd35Components } from "./CharacterComponents.ts";
import CharacterState, { type DataLoader } from "./CharacterState.ts";
import { Builds } from "./concerns/Builds.ts";
import { PossessesVirtually } from "./concerns/PossessesVirtually.ts";
import { Validates } from "./concerns/Validates.ts";
import DetailedCharacterDataLoader from "./loading/DetailedCharacterDataLoader.ts";
import type { ProjectedCharacterLevel } from "./projection.ts";

/** A 3.5 character: its components wired, built and validated by its concerns. */
export default class DetailedCharacter extends include(CharacterState, Builds, PossessesVirtually, Validates) {
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

  /** The schools the character's feats prohibit its wizard spells from: picked, granted, planned or from its modifiers. */
  getProhibitedSchools(): string[] {
    return this.feats.flatMap((feat) => FEAT_FIELDS.read(feat.properties).prohibitedSchools);
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
