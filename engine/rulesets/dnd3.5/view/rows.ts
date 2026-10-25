/**
 * 3.5's kinds' rows, as its storage declaration reads them (`StorageEngine.rowOf`), which it declares into the view's
 * registry (`ViewEntities`). Its entities' links of a role they hold many of are the view's (`ViewLink`, by role: a
 * feat's `listedIn`, a class level's `grants`); a character's rows are as stored (its fields and single links, its
 * links by role, its advancements and their picks by step), its own values read as `CharacterValues` reads them.
 */

import type { EntityRow } from "@/engine/core/view/index.ts";
import type { ItemLocation, SizeType } from "@/shared/enums.ts";

declare module "@/engine/core/view/rows.ts" {
  /** 3.5's owned kind: a class's levels. */
  interface OwnedEntities {
    class_levels: KlassLevel;
  }

  /** 3.5's kinds' rows, by table. */
  interface ViewEntities {
    abilities: RulesetAbility;
    aptitudes: Aptitude;
    class_levels: KlassLevel;
    classes: Klass;
    feats: Feat;
    items: Item;
    languages: Language;
    mechanics: Mechanic;
    races: Race;
    saves: RulesetSave;
    skills: Skill;
    spells: Spell;
  }
}

export type Aptitude = EntityRow;
export type Feat = EntityRow & { generated: boolean; selectable: boolean; stackable: boolean };
export type Item = EntityRow & {
  costGp: string | null;
  isTemplate: boolean;
  slot: ItemLocation;
  sourceItemId: string | null;
  type: string | null;
  weight: string | null;
};
export type Klass = EntityRow & { hd: number; kind: string; parentId: string | null };
export type KlassLevel = Pick<EntityRow, "createdAt" | "deletedAt" | "id" | "updatedAt"> & {
  klassId: string;
  level: number;
};
export type Language = EntityRow & { type: string };
export type Mechanic = EntityRow;
export type Race = EntityRow & { baseSpeed: number; kind: string; parentId: string | null; size: SizeType };
export type RulesetAbility = EntityRow & { description: string };
export type RulesetSave = EntityRow & { abilityId: string };
export type Skill = EntityRow & { primaryAbilityId: string };
export type Spell = EntityRow & { saveEffect: string | null; saveId: string | null };
