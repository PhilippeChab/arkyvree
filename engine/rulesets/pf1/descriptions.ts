import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type RacePicker from "./pickers/RacePicker.ts";
import type { LevelPresets } from "./rules/ClassProgressions.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the Pathfinder rules describe in their own shape: a new character's race options, the sheets, an inventory entry's
 * placement, and a class's base attack bonus and saves' presets.
 */
export interface Pf1Descriptions {
  creationOption: DetailsOf<RacePicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  levelPresets: LevelPresets;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
}
