/**
 * D&D 5th Edition's kinds' entities, as the view holds them (`ViewEntity`: as stored, their fields typed by their vocabulary's
 * declarations, `ENTITY_FIELDS`, and their single links by their storage's roles, `LINK_ROLES`), by type
 * (`Dnd5Kinds`), which it declares into the view's registry (`ModuleKinds`), with its owned kind, and its code reads
 * them by (`DeclaredRows`). Its entities' links of a role they hold many of are the view's (`ViewLink`, by role: a
 * feat's `listedIn`, a class level's `grants`); a character's rows are as stored (its fields and single links, its
 * links by role, its advancements and their picks by step), its own values read as `CharacterValues` reads them.
 */

import type { ViewEntity } from "@/engine/core/view/index.ts";
import type { LINK_ROLES } from "@/engine/rulesets/dnd5/storage/Dnd5Storage.ts";
import type { HeldFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

declare module "@/engine/core/view/rows.ts" {
  /** D&D 5th Edition's kinds: its kinds' entities, by type, and its owned kind, a class's levels. */
  interface ModuleKinds {
    dnd5: { owned: "class-levels"; rows: Dnd5Kinds };
  }
}

/** A kind's entity as the view holds it: its fields as its storage holds them (`HeldFieldValues`), and its single links. */
type Dnd5Entity<T extends keyof typeof ENTITY_FIELDS | null, F extends string> = ViewEntity<
  T extends keyof typeof ENTITY_FIELDS ? HeldFieldValues<(typeof ENTITY_FIELDS)[T]> : NoFields,
  SingleRolesOf<F>
>;

/** No fields: a kind whose entities hold none (an ability, an aptitude, a mechanic). */
type NoFields = Record<never, never>;

/** The roles of a kind's single links (`fromType`'s), as its storage declares them (`LINK_ROLES`). */
type SingleRolesOf<F extends string> = Extract<(typeof LINK_ROLES)[number], { fromType: F; single: true }>["role"];

/** D&D 5th Edition's kinds' entities, by type. */
export interface Dnd5Kinds {
  abilities: RulesetAbility;
  aptitudes: Aptitude;
  backgrounds: Background;
  "class-levels": KlassLevel;
  classes: Klass;
  feats: Feat;
  items: Item;
  languages: Language;
  mechanics: Mechanic;
  saves: RulesetSave;
  skills: Skill;
  species: Species;
  spells: Spell;
}

export type Aptitude = Dnd5Entity<null, "aptitudes">;
/** A background: the abilities its increases go to aside (its links), its Origin feat and proficiencies its grants. */
export type Background = Dnd5Entity<"backgrounds", "backgrounds">;
/** A feat: its pools aside (its links), whether it stacks, whether a level up picks it, whether its ruleset made it… */
export type Feat = Dnd5Entity<"feats", "feats">;
/** An item: its cost, its weight, its type, its slot, whether it's a template, its stats, and its template. */
export type Item = Dnd5Entity<"items", "items">;
/**
 * A class: its hit die, its caster type, its spellcasting ability, and the feats its starting proficiencies are, as a
 * first class and as a multiclass.
 */
export type Klass = Dnd5Entity<"classes", "classes">;
/** A class's level, unnamed: its class (`ownerId`) and its number (`position`). */
export type KlassLevel = Omit<Dnd5Entity<"class-levels", "class-levels">, "name"> & {
  name: null;
  ownerId: string;
  position: number;
};
export type Language = Dnd5Entity<"languages", "languages">;
export type Mechanic = Dnd5Entity<null, "mechanics">;
export type RulesetAbility = Dnd5Entity<null, "abilities"> & { description: string };
/** A save: the ability its bonus comes from (`keyAbility`). */
export type RulesetSave = Dnd5Entity<"saves", "saves">;
/** A skill: the ability its checks add (`keyAbility`). */
export type Skill = Dnd5Entity<"skills", "skills">;
/** A species: its size, its speed, the species it's a kind of (`subspeciesOf`), and what it's for (`partition`). */
export type Species = Dnd5Entity<"species", "species">;
/** A spell: its stat block, and the saving throw it calls for (`resistedBy`). */
export type Spell = Dnd5Entity<"spells", "spells">;
