/**
 * What the characters part's `plan*` operations answer: what the server writes of a character, each a named plan: what
 * a new character starts with (its fields, its single links, its scores), a scored link's edit, a picked link's, an
 * inventory entry's fields. Each names the entities it writes by the ids the ruleset's view keys them by, whichever the
 * request sent (`RequestIds`).
 */

import type { FieldWrite } from "@/engine/core/module/storage.ts";
import type { Character } from "@/shared/relations.ts";

/** What a character's edit writes: its fields' values and own columns, and each picked link's picks it sends, by role. */
export interface CharacterEditPlan extends FieldsPlan {
  links?: Record<string, LinkPicksPlan>;
}

/**
 * What a character's fields edit writes, each checked: its fields' values, by field (3.5's `CHARACTER_XP`), null to
 * clear one, and its row's own columns its rules' fields write (`own`: 3.5's description).
 */
export interface FieldsPlan {
  fields: Record<string, FieldWrite>;
  own: CharacterOwnValues;
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
  location: string | null;
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
 * What a new character stores: what it starts with (`StartPlan`), its kind (its module's player character's,
 * `StoredCharacter.playerKind`), and its fields' values and own columns its form writes, those its rules require among
 * them.
 */
export interface NewCharacterPlan extends StartPlan {
  fields: Record<string, FieldWrite>;
  kind: string;
  own: CharacterOwnValues;
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
 * What a new character starts with: the entity of each of its single links its creation picks (`links`, by role: 3.5's
 * race), and each scored link's amounts (`scores`, by role: 3.5's ability scores), one for each entity of its kind.
 */
export interface StartPlan {
  links: Record<string, string>;
  scores: Record<string, ScorePlan[]>;
}

/** The own columns of a character's row its rules' fields write (3.5's description), each it sets. */
export type CharacterOwnValues = Partial<Pick<Character, "description">>;
