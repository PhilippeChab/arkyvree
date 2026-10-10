import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type { PoolModifier } from "./entities/feats/FeatEntity.ts";
import type LevelSelections from "./levelUp/LevelSelections.ts";
import type LevelUpPreview from "./levelUp/LevelUpPreview.ts";
import type LevelUpSteps from "./levelUp/LevelUpSteps.ts";
import type ClassPicker from "./pickers/ClassPicker.ts";
import type FeatPicker from "./pickers/FeatPicker.ts";
import type Picker from "./pickers/Picker.ts";
import type PowerPicker from "./pickers/PowerPicker.ts";
import type RacePicker from "./pickers/RacePicker.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/** What the 3.5 rules describe in their own shape: the sheets, the level-up wizard's pages, the pickers' options. */
export type Dnd35Descriptions = {
  abilityStep: ReturnType<LevelUpSteps["describeAbilityStep"]>;
  classOption: DetailsOf<ClassPicker>;
  featGroup: { aptitudeModifiers: PoolModifier[]; eligible: boolean; requirementTree: string | undefined };
  featOption: DetailsOf<FeatPicker>;
  featStep: ReturnType<LevelUpSteps["describeFeatStep"]>;
  levelSelections: ReturnType<LevelSelections["describeLevel"]>;
  memberSheet: ReturnType<typeof CharacterDescription.describeForMember>;
  powerOption: DetailsOf<PowerPicker>;
  powerStep: ReturnType<LevelUpSteps["describePowerStep"]>;
  preview: ReturnType<LevelUpPreview["describePreview"]>;
  raceOption: DetailsOf<RacePicker>;
  sheet: ReturnType<typeof CharacterDescription.describe>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
  skillStep: ReturnType<LevelUpSteps["describeSkillStep"]>;
};
