import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type ClassPicker from "./pickers/ClassPicker.ts";
import type FeatPicker from "./pickers/FeatPicker.ts";
import type PowerPicker from "./pickers/PowerPicker.ts";
import type RacePicker from "./pickers/RacePicker.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the 3.5 rules describe in their own shape: the sheets, an inventory entry's placement, a new character's race
 * options, and a step's picker by the kind it reads a page of.
 */
export interface Dnd35Descriptions {
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  partialSheet: ReturnType<typeof CharacterDescription.describePartial>;
  raceOption: DetailsOf<RacePicker>;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
  stepPicker:
    | { kind: "feats"; picker: FeatPicker }
    | { kind: "klasses"; picker: ClassPicker }
    | { kind: "powers"; picker: PowerPicker };
}
