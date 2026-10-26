/**
 * 3.5's kinds' entities, as the view holds them (`ViewEntity`: as stored, their own fields and single links typed),
 * which it declares into the view's registry (`ViewKinds`). Its entities' links of a role they hold many of are the
 * view's (`ViewLink`, by role: a feat's `listedIn`, a class level's `grants`); a character's rows are as stored (its
 * fields and single links, its links by role, its advancements and their picks by step), its own values read as
 * `CharacterValues` reads them.
 */

import type { ViewEntity } from "@/engine/core/view/index.ts";
import type { ItemLocation } from "@/vocabulary/dnd3.5/equipment.ts";
import type {
  CLASS_HD,
  FEAT_GENERATED,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
  SPELL_SAVE_EFFECT,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import type { SizeType } from "@/vocabulary/dnd3.5/sizes.ts";

declare module "@/engine/core/view/rows.ts" {
  /** 3.5's owned kind: a class's levels. */
  interface OwnedKinds {
    class_levels: KlassLevel;
  }

  /** 3.5's kinds' entities, by table. */
  interface ViewKinds {
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

/** No fields of its own. */
type NoOwnFields = Record<never, never>;

export type Aptitude = ViewEntity<NoOwnFields, never>;
/** A feat: whether a character takes it more than once, whether a level up picks it, whether its ruleset made it. */
export type Feat = ViewEntity<
  { [FEAT_GENERATED]: boolean; [FEAT_SELECTABLE]: boolean; [FEAT_STACKABLE]: boolean },
  never
>;
/** An item: its cost, its weight, its type, its slot, whether it's a template, and the template it's made from. */
export type Item = ViewEntity<
  {
    [ITEM_COST_GP]?: number;
    [ITEM_IS_TEMPLATE]: boolean;
    [ITEM_SLOT]: ItemLocation;
    [ITEM_TYPE]?: string;
    [ITEM_WEIGHT]?: number;
  },
  "madeFrom"
>;
/** A class: its hit die, the class it's a kind of (`subclassOf`), and what it's for (`partition`: `pc`, a familiar…). */
export type Klass = ViewEntity<{ [CLASS_HD]: number }, "subclassOf">;
/** A class's level, unnamed: its class (`ownerId`) and its number (`position`). */
export type KlassLevel = Omit<ViewEntity<NoOwnFields, never>, "name"> & {
  name: null;
  ownerId: string;
  position: number;
};
export type Language = ViewEntity<{ [LANGUAGE_TYPE]?: string }, never>;
export type Mechanic = ViewEntity<NoOwnFields, never>;
/** A race: its size, its base speed, the race it's a kind of (`subraceOf`), and what it's for (`partition`). */
export type Race = ViewEntity<{ [RACE_BASE_SPEED]: number; [RACE_SIZE]: SizeType }, "subraceOf">;
export type RulesetAbility = ViewEntity<NoOwnFields, never> & { description: string };
/** A save: the ability its bonus comes from (`keyAbility`). */
export type RulesetSave = ViewEntity<NoOwnFields, "keyAbility">;
/** A skill: the ability its checks add (`keyAbility`). */
export type Skill = ViewEntity<NoOwnFields, "keyAbility">;
/** A spell: what a save against it does, and the save it allows (`resistedBy`). */
export type Spell = ViewEntity<{ [SPELL_SAVE_EFFECT]?: string }, "resistedBy">;
