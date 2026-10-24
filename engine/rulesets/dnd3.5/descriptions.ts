import type { Picker } from "@/engine/core/pickers/index.ts";

import type CharacterDescription from "./characters/description/CharacterDescription.ts";
import type InventoryEntries from "./characters/inventory/InventoryEntries.ts";
import type CharacterSheet from "./characters/sheet/CharacterSheet.tsx";
import type ClassPicker from "./pickers/ClassPicker.ts";
import type FeatPicker from "./pickers/FeatPicker.ts";
import type RacePicker from "./pickers/RacePicker.ts";
import type SpellPicker from "./pickers/SpellPicker.ts";

/** What a picker adds to each of its options. */
type DetailsOf<P> = P extends Picker<infer _Row, infer Details> ? Details : never;

/**
 * What the 3.5 rules describe in their own shape: a new character's race options, the sheets, an inventory entry's
 * placement, and a step's picker by the kind it reads a page of.
 */
export interface Dnd35Descriptions {
  creationOption: DetailsOf<RacePicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  partialSheet: ReturnType<typeof CharacterDescription.describePartial>;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
  stepPicker:
    | { kind: "feats"; picker: FeatPicker }
    | { kind: "classes"; picker: ClassPicker }
    | { kind: "spells"; picker: SpellPicker };
}
