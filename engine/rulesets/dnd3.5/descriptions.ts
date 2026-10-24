import type { Picker } from "@/engine/core/pickers/index.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";

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
 * How a new character's ability scores are set: the ruleset's abilities, in the order its sheet lists them
 * (`abilities`), the ways its form offers (`methods`), the scores' bounds and the one an ability shows before it's
 * rolled or set (`scores`), and each score's modifier over those bounds (`modifiers`).
 */
export interface CharacterCreation {
  abilities: { id: string; name: string }[];
  methods: CreationMethod[];
  modifiers: Record<number, number>;
  scores: { max: number; min: number; start: number };
}

/**
 * What the 3.5 rules describe in their own shape: how a new character's ability scores are set, its race options, the
 * languages a character speaks and may pick, the sheets, an inventory entry's placement, and a step's picker by the
 * kind it reads a page of.
 */
export interface Dnd35Descriptions {
  creation: CharacterCreation;
  creationOption: DetailsOf<RacePicker>;
  inventoryEntry: ReturnType<typeof InventoryEntries.describeInventoryEntry>;
  linkRoom: LanguagesDescription;
  partialSheet: ReturnType<typeof CharacterDescription.describePartial>;
  sheet: ReturnType<typeof CharacterDescription.describeFull>;
  sheetDocument: ReturnType<typeof CharacterSheet.describeSheet>;
  stepPicker:
    | { kind: "feats"; picker: FeatPicker }
    | { kind: "klasses"; picker: ClassPicker }
    | { kind: "powers"; picker: PowerPicker };
}

/**
 * What a character speaks, and what its picked languages (an edit's, as it's made) leave it room for: what its
 * languages picker offers. `automatic`: those it speaks without picking them (a 3.5 race's automatic languages, which
 * its modifiers grant), never stored; `picks`: the picks, past those; `options`: the languages one more pick may add,
 * by name, none once the picks fill the room its rules give them.
 */
export interface LanguagesDescription {
  automatic: DescribedLanguage[];
  options: DescribedLanguage[];
  picks: DescribedLanguage[];
}

/**
 * A way a new character's ability scores are set, which its form runs by its kind: rolled (`dice`: `count` dice of
 * `sides`, the highest `keep` summed), taken from an array (`scores`, each to one ability), or bought (`costs`, each
 * score's from `min` to `max`, out of `budget`).
 */
export type CreationMethod = { id: string; label: string } & (
  | { dice: { count: number; keep: number; sides: number }; kind: "roll" }
  | { kind: "array"; scores: readonly number[] }
  | { budget: number; costs: Readonly<Record<number, number>>; kind: "pointBuy"; max: number; min: number }
);

/** A language, as a character's languages name it. */
export type DescribedLanguage = Pick<ViewEntities["languages"], "id" | "name" | "type">;
