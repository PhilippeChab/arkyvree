import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type RacePicker from "./pickers/RacePicker.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the 3.5 rules describe in their own shape: a new character's race options, the sheets, and an inventory entry's
 * placement.
 */
export interface Dnd35Descriptions {
  creationOption: DetailsOf<RacePicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
}
