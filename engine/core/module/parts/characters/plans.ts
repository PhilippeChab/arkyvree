/**
 * What the characters part's `plan*` operations answer: what the server writes of a character, each a named plan: what
 * a new character starts with, a scored link's edit, a picked link's, an inventory entry's fields. Each names the
 * entities it writes by the ids the ruleset's view keys them by, whichever the request sent (`RequestIds`).
 */

import type { ItemLocation } from "@/shared/enums.ts";

/**
 * The columns of a character's row its module stores as its fields and single links (`StoredCharacter.columns`), as
 * it writes them: its module declares its own into it (`declare module`).
 */
export interface CharacterColumns {}

/** What a character's edit writes: its fields' columns, and each picked link's picks it sends (`links`, by name). */
export interface CharacterEditPlan extends FieldsPlan {
  links?: Record<string, LinkPicksPlan>;
}

/**
 * The columns of a character's row its creation's picks write (each single link's entity: 3.5's race), which every
 * character has: its module declares its own into it (`declare module`).
 */
export interface CreationColumns {}

/**
 * What a character's fields edit writes: the columns its ruleset stores its fields in (`CharacterColumns`), each
 * checked.
 */
export interface FieldsPlan {
  columns: Partial<CharacterColumns>;
}

/**
 * What an inventory entry's add or edit stores: its item (an added one's, by the view's id; the one an edited entry
 * keeps), where it's held, and its charges.
 */
export interface InventoryEntryPlan {
  equipped: boolean;
  /** The groups it's held in, stored from 0 (3.5's weapon sets a hand holds it in): none outside them */
  groups: number[];
  itemId: string;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
}

/** What a picked link's edit writes: the entities picked, past those the character has without picking them. */
export interface LinkPicksPlan {
  entityIds: string[];
}

/** A character's link to an entity, as a write stores it: the entity, and its amount when its link holds one. */
export interface LinkPlan {
  amount?: number;
  entityId: string;
}

/**
 * What a new character stores: what it starts with (`StartPlan`), and the columns its fields write, those its row
 * requires among them.
 */
export interface NewCharacterPlan extends StartPlan {
  columns: CharacterColumns & CreationColumns;
}

/** A character's scored link to an entity, as a write stores it: the entity, and its amount. */
export interface ScorePlan extends LinkPlan {
  amount: number;
}

/** What a scored link's edit writes: the character's amount for each entity it sends. */
export interface ScoresPlan {
  links: ScorePlan[];
}

/**
 * What a new character starts with: the columns its creation's picks write (each single link's entity), and each
 * scored link's rows, by name: an amount for each entity of its kind.
 */
export interface StartPlan {
  columns: CreationColumns;
  links: Record<string, ScorePlan[]>;
}
