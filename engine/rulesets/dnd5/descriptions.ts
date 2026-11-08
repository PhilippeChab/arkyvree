import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type SpeciesPicker from "./pickers/SpeciesPicker.ts";
import type { LevelPresets } from "./rules/ClassProgressions.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the D&D 5th Edition rules describe in their own shape: a new character's species and background options, the sheets, an inventory entry's
 * placement, and the Proficiency Bonus by level.
 */
export interface Dnd5Descriptions {
  creationOption: DetailsOf<SpeciesPicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  levelPresets: LevelPresets;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
}
