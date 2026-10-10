/**
 * What a `plan*` operation answers: a named plan, never a bare list, saying what the server writes, by table, without
 * ids it doesn't have yet. The server writes each as it is.
 */

import type { ItemLocation } from "@/shared/enums.ts";
import type { Character, Modifier, Requirement } from "@/shared/relations.ts";

import type { CharacterRows } from "./CharacterInputs.ts";

/**
 * What a create or an edit writes of an entity: its row's columns (`C`), the lists it's linked to (`links`, none: kept),
 * what it writes beside its row, and the fields the entity keeps once written (`F`, which the action answers with its row).
 */
interface EntityWrite<C, F> {
  columns: C;
  fields: F;
  links?: ListLink[];
  writes?: EntityWrites;
}

/** The properties an entity's fields are kept in: those of `types` it has give way to `values`. */
interface PropertiesWrite {
  types: readonly string[];
  values: PropertyValue[];
}

/** A requirement a plan sets on an entity: what it asks of the character. */
type RequirementWrite = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/** What a character's ability edit writes: its scores, each checked. */
export interface AbilitiesPlan {
  abilities: AbilityScore[];
}

/** An ability a level raises, and by how much. */
export interface AbilityIncrease {
  abilityId: string;
  amount: number;
}

/** A character's score in one of its ruleset's abilities, as it stores it. */
export interface AbilityScore {
  abilityId: string;
  score: number;
}

/** What a master's bonded creatures become: one plan per kind of creature its levels give it. */
export interface BondedCreaturesPlan {
  bonded: BondedPlan[];
}

/** The levels a bonded creature takes (their rows' columns), and the ids of those it loses. */
export interface BondedLevelsPlan {
  added: LevelColumns[];
  removedIds: string[];
}

/**
 * What a master's bonded creature of a kind (`kind`, the creature's character kind) becomes once the master's levels
 * change. Without one for the kind, the creature the master had goes (`removedId`). With one, the master keeps the
 * creature it has (`keptId`), or one is made (`created`) in place of the one it had; the creature kept or made takes or
 * loses `levels`.
 */
export type BondedPlan = { kind: string; removedId?: string } & (
  | { created: NewBondedCreature; levels: BondedLevelsPlan }
  | { keptId: string; levels: BondedLevelsPlan }
  | { levels: undefined }
);

/** What an entity's create writes, and whose customizations the new entity copies (`copyCustomizationsFrom`). */
export interface EntityCreatePlan<C = Record<string, unknown>, F = object> extends EntityWrite<C, F> {
  copyCustomizationsFrom?: string;
}

/** What an entity's delete writes: the entity as the view has it (`E`), and what goes with it. */
export interface EntityDeletePlan<E = { id: string; name: string }> {
  entity: E;
  writes?: EntityWrites;
}

/** What an entity's edit writes: the entity as the view has it (`E`), and its new row and what goes beside it. */
export interface EntityEditPlan<
  C = Record<string, unknown>,
  F = object,
  E = { id: string; name: string },
> extends EntityWrite<C, F> {
  entity: E;
}

/**
 * An entity a plan removes with the one it writes (`type`, its table, and its `id`): refused (`inUse`) while a
 * character of the ruleset picked it.
 */
export interface EntityRemoval {
  id: string;
  inUse: string;
  type: string;
}

/**
 * What an entity's form writes beside its row, as its ruleset's rules say: the properties its fields are kept in (none:
 * those it has stay), a requirement on it, and the entities it makes and removes with it (`made`, `removed`). The
 * server writes each by its table.
 */
export interface EntityWrites {
  made?: MadeEntity[];
  properties?: PropertiesWrite;
  removed?: EntityRemoval[];
  requirement?: RequirementWrite;
}

/** A feat picked in a pool. */
export interface FeatPick {
  aptitudeId: string;
  featId: string;
}

/** What an inventory entry's add or edit stores: where its item is held, and its charges. */
export interface InventoryEntryPlan {
  equipped: boolean;
  location: ItemLocation | null;
  remainingCharges: number | null;
  totalCharges: number | null;
  weaponSet: number | null;
}

/** A level's row, as a level-up writes it beside its character's: its class level and hit points. */
export interface LevelColumns {
  hp: number;
  klassLevelId: string;
}

/**
 * What a saved level's edit writes, checked: the level as saved (`level`), its row's new columns and its rows under it
 * in place of those it had, and what the bonded creatures become.
 */
export interface LevelEditPlan extends BondedCreaturesPlan, LevelWrites<Omit<LevelColumns, "klassLevelId">> {
  level: CharacterRows["levels"][number];
}

/** A level's picks as the rows a level-up writes: its feats and powers, each in its pool, and its skill ranks. */
export interface LevelPickRows {
  feats: FeatPick[];
  powers: PowerPick[];
  skills: SkillRank[];
}

/** What removing a character's last level writes: the level that goes, and what its bonded creatures become. */
export interface LevelRemovalPlan extends BondedCreaturesPlan {
  level: CharacterRows["levels"][number];
}

/** A level's rows in the tables under it, by table, as a level-up writes them: its ability increases and its picks. */
export interface LevelRows extends LevelPickRows {
  abilityIncreases: AbilityIncrease[];
}

/** What a level-up writes, checked: each level's writes, and what the master's bonded creatures become. */
export interface LevelsPlan extends BondedCreaturesPlan {
  levels: LevelWrites[];
}

/**
 * What a level-up writes of a level: its row's columns (`columns`, `C`), and its rows in the tables under it (`rows`),
 * by table. The server writes each as it is.
 */
export interface LevelWrites<C = LevelColumns> {
  columns: C;
  rows: LevelRows;
}

/** A list an entity is linked to (`aptitudeId`), and its level on it (a power's spell level on a class's list). */
export interface ListLink {
  aptitudeId: string;
  level?: number | null;
}

/**
 * An entity a plan makes with the one it writes, in the same ruleset: its table (`type`), its row's columns, the lists
 * it's linked to (`links`), and its modifiers, properties and requirements.
 */
export interface MadeEntity {
  columns: Record<string, unknown> & { description: string; name: string };
  links: ListLink[];
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  properties: PropertyValue[];
  requirements: RequirementWrite[];
  type: string;
}

/**
 * A bonded creature a plan makes: its character's row, whole (its master's, of its kind, its race and name, and what it
 * takes of its master), and its ability scores.
 */
export interface NewBondedCreature {
  abilities: AbilityScore[];
  row: Pick<
    Character,
    "alignment" | "gender" | "kind" | "name" | "parentCharacterId" | "raceId" | "rulesetId" | "userId" | "xp"
  >;
}

/** What a new character stores beside its row: a score for each of the ruleset's abilities. */
export interface NewCharacterPlan {
  abilities: AbilityScore[];
}

/** A power picked in a pool. */
export interface PowerPick {
  aptitudeId: string;
  powerId: string;
}

/** A property a plan keeps a field in: its type and value, on the entity it writes. */
export interface PropertyValue {
  type: string;
  value: string;
}

/** A skill's ranks a level buys. */
export interface SkillRank {
  rank: number;
  skillId: string;
}
