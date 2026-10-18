/**
 * What the imports part's `planImport` answers: what the server writes of a character imported from another program's
 * file, and the report of what it imported and couldn't.
 */

import type { AbilityScore, InventoryEntryPlan } from "@/engine/core/module/parts/characters/index.ts";
import type { BondedCreaturesPlan, LevelWrites } from "@/engine/core/module/parts/levelUp/index.ts";
import type { Character } from "@/shared/relations.ts";

/** Who an imported character is: its row's id, which its rows under it and its bonded creatures name, and its owner. */
export interface ImportOwner {
  characterId: string;
  userId: string;
}

/**
 * What an import writes: a new character's row (its owner and ruleset aside), its ability scores, the languages it
 * picked, its levels as if leveled up one at a time (their rows' columns and the rows under them, in order), its
 * inventory entries, and what its bonded creatures become; and the report of what it did.
 */
export interface ImportPlan extends BondedCreaturesPlan {
  abilities: AbilityScore[];
  character: ImportedRow;
  inventory: (InventoryEntryPlan & { quantity: number })[];
  languageIds: string[];
  levels: LevelWrites[];
  report: ImportReportDescription;
}

/**
 * What an import says it did: the program that saved the file, what it imported, what the checks a level-up runs found
 * of the levels it saved (`issues`), and each line of the file it couldn't match (its number, its text, and why).
 */
export interface ImportReportDescription {
  imported: string[];
  issues: string[];
  program: string;
  unmatched: { line: number; reason: string; text: string }[];
}

/** A new character's row, as an import fills it. */
export type ImportedRow = Pick<
  Character,
  | "age"
  | "alignment"
  | "deity"
  | "description"
  | "gender"
  | "height"
  | "name"
  | "notes"
  | "privateNotes"
  | "raceId"
  | "weight"
  | "xp"
>;
