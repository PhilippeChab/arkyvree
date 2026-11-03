/**
 * 3.5's kinds' entities, as the view holds them (`ViewEntity`: as stored, their fields typed by their vocabulary's
 * declarations, `ENTITY_FIELDS`, and their single links by their storage's roles, `LINK_ROLES`), which it declares into
 * the view's registry (`ViewKinds`). Its entities' links of a role they hold many of are the
 * view's (`ViewLink`, by role: a feat's `listedIn`, a class level's `grants`); a character's rows are as stored (its
 * fields and single links, its links by role, its advancements and their picks by step), its own values read as
 * `CharacterValues` reads them.
 */

import type { ViewEntity } from "@/engine/core/view/index.ts";
import type { LINK_ROLES } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import type { HeldFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

declare module "@/engine/core/view/rows.ts" {
  /** 3.5's kind a character's inventory holds: its items. */
  interface InventoryKinds {
    items: Item;
  }

  /** 3.5's owned kind: a class's levels. */
  interface OwnedKinds {
    "class-levels": KlassLevel;
  }

  /** 3.5's kinds' entities, by type. */
  interface ViewKinds {
    abilities: RulesetAbility;
    aptitudes: Aptitude;
    "class-levels": KlassLevel;
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

/** A kind's entity as the view holds it: its fields as its storage holds them (`HeldFieldValues`), and its single links. */
type Entity35<T extends keyof typeof ENTITY_FIELDS | null, F extends string> = ViewEntity<
  T extends keyof typeof ENTITY_FIELDS ? HeldFieldValues<(typeof ENTITY_FIELDS)[T]> : NoFields,
  SingleRolesOf<F>
>;

/** No fields: a kind whose entities hold none (an ability, an aptitude, a mechanic). */
type NoFields = Record<never, never>;

/** The roles of a kind's single links (`fromType`'s), as its storage declares them (`LINK_ROLES`). */
type SingleRolesOf<F extends string> = Extract<(typeof LINK_ROLES)[number], { fromType: F; single: true }>["role"];

export type Aptitude = Entity35<null, "aptitudes">;
/** A feat: its pools aside (its links), whether it stacks, whether a level up picks it, whether its ruleset made it… */
export type Feat = Entity35<"feats", "feats">;
/** An item: its cost, its weight, its type, its slot, whether it's a template, its stats, and its template. */
export type Item = Entity35<"items", "items">;
/** A class: its hit die, its caster type, the class it's a kind of (`subclassOf`), its bonus spell ability. */
export type Klass = Entity35<"classes", "classes">;
/** A class's level, unnamed: its class (`ownerId`) and its number (`position`). */
export type KlassLevel = Omit<Entity35<"class-levels", "class-levels">, "name"> & {
  name: null;
  ownerId: string;
  position: number;
};
export type Language = Entity35<"languages", "languages">;
export type Mechanic = Entity35<null, "mechanics">;
/** A race: its size, its base speed, the race it's a kind of (`subraceOf`), and what it's for (`partition`). */
export type Race = Entity35<"races", "races">;
export type RulesetAbility = Entity35<null, "abilities"> & { description: string };
/** A save: the ability its bonus comes from (`keyAbility`). */
export type RulesetSave = Entity35<"saves", "saves">;
/** A skill: the ability its checks add (`keyAbility`), and how armor weighs on it. */
export type Skill = Entity35<"skills", "skills">;
/** A spell: its stat block, what a save against it does, and the save it allows (`resistedBy`). */
export type Spell = Entity35<"spells", "spells">;
