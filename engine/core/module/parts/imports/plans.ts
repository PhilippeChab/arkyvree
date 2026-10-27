/**
 * What the imports part's `planImport` answers: what the server writes of a character imported from another program's
 * file, and the report of what it imported and couldn't.
 */

import type { CharacterOwnValues, InventoryEntryPlan, LinkPlan } from "@/engine/core/module/parts/characters/index.ts";
import type { AdvancementPlan, ChildrenPlan } from "@/engine/core/module/parts/levelUp/index.ts";
import type { Character, CharacterFieldValue } from "@/shared/relations.ts";

/**
 * What an importer makes of a file it recognizes, before any ruleset is picked: the file (`source`), and why the
 * importer can't import it when it can't (`refusal`: another game mode's character, a format no reader reads yet).
 */
export interface ImportDetection {
  refusal?: string;
  source: ImportSource;
}

/** Who an imported character is: its row's id, which its rows under it and its children name, and its owner. */
export interface ImportOwner {
  characterId: string;
  userId: string;
}

/**
 * What an import writes: a new character's row (its owner and ruleset aside), its advancements as if leveled up one at
 * a time (each its entry and its picks, in order), its links by role (each scored link's amounts, each picked link's
 * picks), its inventory entries, and what its children become; and the report of what it did.
 */
export interface ImportPlan extends ChildrenPlan {
  advancements: AdvancementPlan[];
  character: ImportedRow;
  inventory: (InventoryEntryPlan & { quantity: number })[];
  links: Record<string, LinkPlan[]>;
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

/**
 * The file a character is imported from, as the file says it: the program that saved it and that program's version,
 * the file's format, and the rules its character is of, in the program's words (PCGen's game mode, `35e`), when it
 * names them.
 */
export interface ImportSource {
  format: string;
  program: string;
  rules?: string;
  version: string;
}

/**
 * A new character's row, as an import fills it: its kind (its module's player character's), its name, notes and own
 * columns, its fields' values (null: none) and its single links' entities, by role (3.5's race).
 */
export type ImportedRow = CharacterOwnValues &
  Pick<Character, "kind" | "name" | "notes" | "privateNotes"> & {
    fields: Record<string, CharacterFieldValue | null>;
    links: Record<string, string>;
  };
