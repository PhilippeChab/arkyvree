import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type Dnd35LevelSelections from "./levelUp/Dnd35LevelSelections.ts";
import type LevelUpPreview from "./levelUp/LevelUpPreview.ts";
import type LevelUpSteps from "./levelUp/LevelUpSteps.ts";
import type ClassPicker from "./pickers/ClassPicker.ts";
import type { FeatGroupDetails, default as FeatPicker } from "./pickers/FeatPicker.ts";
import type PowerPicker from "./pickers/PowerPicker.ts";
import type RacePicker from "./pickers/RacePicker.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the 3.5 rules describe in their own shape: the sheets, an inventory entry's placement, the level-up wizard's
 * pages, the pickers' options.
 */
export interface Dnd35Descriptions {
  classOption: DetailsOf<ClassPicker>;
  featGroup: FeatGroupDetails;
  featOption: DetailsOf<FeatPicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  levelSelections: ReturnType<Dnd35LevelSelections["describeLevel"]>;
  partialSheet: ReturnType<typeof CharacterDescription.describePartial>;
  powerOption: DetailsOf<PowerPicker>;
  preview: ReturnType<LevelUpPreview["describePreview"]>;
  raceOption: DetailsOf<RacePicker>;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
  step: ReturnType<LevelUpSteps["describeStep"]>;
}
