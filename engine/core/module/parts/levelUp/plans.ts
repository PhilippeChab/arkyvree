/**
 * What the level-up part's `plan*` operations answer: what the server writes of a level-up, a saved level's edit, a
 * level's removal and the character's children (the characters its levels give it: 3.5's bonded creatures), each a
 * named plan, without ids it doesn't have yet. A level is an advancement as stored, its picks under it by step (its
 * value step's too, 3.5's hit points).
 */

import type { LinkPlan } from "@/engine/core/module/parts/characters/index.ts";
import type { FieldWrite, StoredAdvancement } from "@/engine/core/module/storage.ts";
import type { Character } from "@/shared/relations.ts";

/** What a level-up writes of an advancement: its entry (3.5's class level), and its picks under it. */
export interface AdvancementPlan {
  entryId: string;
  picks: PickPlan[];
}

/** The advancements a child takes, and the ids of those it loses. */
export interface ChildLevelsPlan {
  added: AdvancementPlan[];
  removedIds: string[];
}

/** What a character's children become: one plan per kind of child its levels give it. */
export interface ChildrenPlan {
  children: ChildPlan[];
}

/**
 * What a saved level's edit writes, checked: the advancement as saved (`advancement`, which keeps its entry), its picks
 * in place of those it had, and what the children become.
 */
export interface LevelEditPlan extends ChildrenPlan {
  advancement: StoredAdvancement;
  picks: PickPlan[];
}

/** What removing a character's last level writes: the advancement that goes, and what its children become. */
export interface LevelRemovalPlan extends ChildrenPlan {
  advancement: StoredAdvancement;
}

/** What a level-up writes, checked: each advancement's writes, and what the character's children become. */
export interface LevelsPlan extends ChildrenPlan {
  advancements: AdvancementPlan[];
}

/**
 * A child a plan makes: its character's row, whole (its parent's, of its kind, its fields' values and single links'
 * entities, and what it takes of its parent), and its links of each role it holds many of, by role (3.5's `score`).
 */
export interface NewChild {
  links: Record<string, LinkPlan[]>;
  row: Pick<Character, "kind" | "name" | "parentCharacterId" | "rulesetId" | "userId"> & {
    fields: Record<string, FieldWrite>;
    links: Record<string, string>;
  };
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
 * What a character's child of a kind (`kind`, the child's character kind) becomes once the character's levels change.
 * Without one for the kind, the child the character had goes (`removedId`). With one, the character keeps the child it
 * has (`keptId`), or one is made (`created`) in place of the one it had; the child kept or made takes or loses
 * `levels`.
 */
export type ChildPlan = { kind: string; removedId?: string } & (
  | { created: NewChild; levels: ChildLevelsPlan }
  | { keptId: string; levels: ChildLevelsPlan }
  | { levels: undefined }
);
