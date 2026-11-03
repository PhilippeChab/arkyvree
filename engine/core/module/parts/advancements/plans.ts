/**
 * What the advancement part's `plan*` operations answer: what the server writes of a plan's save, a saved advancement's
 * edit, an advancement's removal and the character's children (the characters its advancements give it: 3.5's bonded
 * creatures), each a named plan, without ids it doesn't have yet. An advancement is written as stored, its picks under
 * it by step (its value step's too, 3.5's hit points).
 */

import type { NewCharacterPlan, NewCharacterRow } from "@/engine/core/module/parts/characters/index.ts";
import type { StoredAdvancement } from "@/engine/core/module/storage.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * What a saved advancement's edit writes, checked: the advancement as saved (`advancement`, which keeps its entry), its
 * picks in place of those it had, and what the children become.
 */
export interface AdvancementEditPlan extends ChildrenPlan {
  advancement: StoredAdvancement;
  picks: PickPlan[];
}

/** What removing a character's last advancement writes: the advancement that goes, and what its children become. */
export interface AdvancementRemovalPlan extends ChildrenPlan {
  advancement: StoredAdvancement;
}

/** What a plan's save writes, checked: each advancement's writes, and what the character's children become. */
export interface AdvancementsPlan extends ChildrenPlan {
  advancements: AdvancementWrite[];
}

/** What a save writes of an advancement: its entry (3.5's class level), and its picks under it. */
export interface AdvancementWrite {
  entryId: string;
  picks: PickPlan[];
}

/** The advancements a child takes, and the ids of those it loses. */
export interface ChildAdvancementChanges {
  added: AdvancementWrite[];
  removedIds: string[];
}

/** What a character's children become: one plan per kind of child its advancements give it. */
export interface ChildrenPlan {
  children: ChildPlan[];
}

/**
 * A pick an advancement takes (`character.advancement_picks`), of a step its module declares: the entity it picks,
 * through its pool (`viaId`) when its step takes one, and its amount when it holds one (3.5's skill ranks, an ability
 * increase); a value step's holds its amount alone (3.5's hit points).
 */
export interface PickPlan {
  amount?: number;
  entityId?: string;
  step: string;
  viaId?: string;
}

/**
 * What a character's child of a kind (`kind`, the child's character kind) becomes once the character's advancements
 * change. Without one for the kind, the child the character had goes (`removedId`). With one, the character keeps the
 * child it has (`keptId`), or one is made (`created`) in place of the one it had; the child kept or made takes or loses
 * advancements (`advancementChanges`).
 */
export type ChildPlan = { kind: string; removedId?: string } & (
  | { advancementChanges: ChildAdvancementChanges; created: NewChild }
  | { advancementChanges: ChildAdvancementChanges; keptId: string }
  | { advancementChanges: undefined }
);

/**
 * A child a plan makes (`NewCharacterPlan`): its character's row, whole (its parent's, of its kind, its fields' values
 * and single links' entities, and what it takes of its parent), and its links of each role it holds many of, by role
 * (3.5's `score`).
 */
export type NewChild = NewCharacterPlan<
  NewCharacterRow & Pick<Character, "name" | "parentCharacterId" | "rulesetId" | "userId">
>;
