/**
 * Pathfinder's kinds' entities, as the view holds them (`ViewEntity`: as stored, their fields typed by their vocabulary's
 * declarations, `ENTITY_FIELDS`, and their single links by their storage's roles, `LINK_ROLES`), by type
 * (`Dnd52Kinds`), which it declares into the view's registry (`ModuleKinds`), with its owned kind, and its code reads
 * them by (`DeclaredRows`). Its entities' links of a role they hold many of are the view's (`ViewLink`, by role: a
 * feat's `listedIn`, a class level's `grants`); a character's rows are as stored (its fields and single links, its
 * links by role, its advancements and their picks by step), its own values read as `CharacterValues` reads them.
 */

import type { ViewEntity } from "@/engine/core/view/index.ts";
import type { LINK_ROLES } from "@/engine/rulesets/dnd5.2/storage/Dnd52Storage.ts";
import type { HeldFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

declare module "@/engine/core/view/rows.ts" {
  /** Pathfinder's kinds: its kinds' entities, by type, and its owned kind, a class's levels. */
  interface ModuleKinds {
    "dnd5.2": { owned: "class-levels"; rows: Dnd52Kinds };
  }
}

/** No fields: a kind whose entities hold none (an ability, an aptitude, a mechanic). */
type NoFields = Record<never, never>;

/** A kind's entity as the view holds it: its fields as its storage holds them (`HeldFieldValues`), and its single links. */
type Dnd52Entity<T extends keyof typeof ENTITY_FIELDS | null, F extends string> = ViewEntity<
  T extends keyof typeof ENTITY_FIELDS ? HeldFieldValues<(typeof ENTITY_FIELDS)[T]> : NoFields,
  SingleRolesOf<F>
>;

/** The roles of a kind's single links (`fromType`'s), as its storage declares them (`LINK_ROLES`). */
type SingleRolesOf<F extends string> = Extract<(typeof LINK_ROLES)[number], { fromType: F; single: true }>["role"];

/** Pathfinder's kinds' entities, by type. */
export interface Dnd52Kinds {
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

export type Aptitude = Dnd52Entity<null, "aptitudes">;
/** A feat: its pools aside (its links), whether it stacks, whether a level up picks it, whether its ruleset made it… */
export type Feat = Dnd52Entity<"feats", "feats">;
/** An item: its cost, its weight, its type, its slot, whether it's a template, its stats, and its template. */
export type Item = Dnd52Entity<"items", "items">;
/** A class: its hit die, its caster type, the class it's a kind of (`subclassOf`), its bonus spell ability. */
export type Klass = Dnd52Entity<"classes", "classes">;
/** A class's level, unnamed: its class (`ownerId`) and its number (`position`). */
export type KlassLevel = Omit<Dnd52Entity<"class-levels", "class-levels">, "name"> & {
  name: null;
  ownerId: string;
  position: number;
};
export type Language = Dnd52Entity<"languages", "languages">;
export type Mechanic = Dnd52Entity<null, "mechanics">;
/** A race: its size, its base speed, the race it's a kind of (`subraceOf`), and what it's for (`partition`). */
export type Race = Dnd52Entity<"races", "races">;
export type RulesetAbility = Dnd52Entity<null, "abilities"> & { description: string };
/** A save: the ability its bonus comes from (`keyAbility`). */
export type RulesetSave = Dnd52Entity<"saves", "saves">;
/** A skill: the ability its checks add (`keyAbility`), and how armor weighs on it. */
export type Skill = Dnd52Entity<"skills", "skills">;
/** A spell: its stat block, what a save against it does, and the save it allows (`resistedBy`). */
export type Spell = Dnd52Entity<"spells", "spells">;
