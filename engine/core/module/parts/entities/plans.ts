/**
 * What an entity kind's `plan*` operations answer: what the server writes of an entity's create, edit or delete, each a
 * named plan, by table, without ids it doesn't have yet: its row, its lists, what it writes beside it.
 */

import type { Modifier, Requirement } from "@/shared/relations.ts";

/**
 * What a create or an edit writes of an entity: its row's columns (`C`), the lists it's linked to (`links`, none:
 * kept), what it writes beside its row, and the fields the entity keeps once written (`F`, which the action answers
 * with its row).
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

/**
 * The entities made from the one a plan writes, which the plan reaches (a template's copies): what the server reads
 * them with (`filters`), where the plan reaches them (the ruleset's view, and the rulesets built on it), and what
 * refuses the plan by them (`check`).
 */
export interface EntityCopies {
  check(copies: (Record<string, unknown> & { id: string; name: string })[]): void;
  filters: { columns: Record<string, unknown> };
}

/**
 * What copies of an entity write (an item's variants): each copy's row's columns (`C`), and whose customizations they
 * copy (`copyCustomizationsFrom`).
 */
export interface EntityCopiesPlan<C = Record<string, unknown>> {
  copyCustomizationsFrom?: string;
  rows: C[];
}

/** What an entity's create writes, and whose customizations the new entity copies (`copyCustomizationsFrom`). */
export interface EntityCreatePlan<C = Record<string, unknown>, F = object> extends EntityWrite<C, F> {
  copyCustomizationsFrom?: string;
}

/**
 * What an entity's delete writes: the entity as the view has it (`E`), what goes with it, and the copies that may
 * refuse it.
 */
export interface EntityDeletePlan<E = { id: string; name: string }> {
  copies?: EntityCopies;
  entity: E;
  writes?: EntityWrites;
}

/**
 * What an entity's edit writes: the entity as the view has it (`E`), its new row and what goes beside it, and the
 * copies that may refuse it.
 */
export interface EntityEditPlan<
  C = Record<string, unknown>,
  F = object,
  E = { id: string; name: string },
> extends EntityWrite<C, F> {
  copies?: EntityCopies;
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

/**
 * Adding a link from an entity through the join its owner edits (`join`: a class's skills): the owner as the view has
 * it, the join's row but its from-column (`row`), and what its activity records (`activity`).
 */
export interface LinkAddPlan {
  activity: Record<string, unknown>;
  join: string;
  owner: PlanOwner;
  row: Record<string, unknown>;
}

/**
 * Removing a link through the join its owner edits (`join`): the owner, the link's target, and what its activity
 * records.
 */
export interface LinkRemovePlan {
  activity: Record<string, unknown>;
  join: string;
  owner: PlanOwner;
  toId: string;
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

/** What an owned entity's create writes past an entity's: its joins' rows, its owner, and what its activity records. */
export interface OwnedCreatePlan<C = Record<string, unknown>, F = object> extends EntityCreatePlan<C, F> {
  activity: Record<string, unknown>;
  joins: JoinRows;
  owner: PlanOwner;
}

/** What an owned entity's delete writes past an entity's: its owner, and what its activity records. */
export interface OwnedDeletePlan<E = { id: string; name: string }> extends EntityDeletePlan<E> {
  activity: Record<string, unknown>;
  owner: PlanOwner;
}

/** What an owned entity's edit writes past an entity's: its joins' rows, its owner, and what its activity records. */
export interface OwnedEditPlan<
  C = Record<string, unknown>,
  F = object,
  E = { id: string; name: string },
> extends EntityEditPlan<C, F, E> {
  activity: Record<string, unknown>;
  joins: JoinRows;
  owner: PlanOwner;
}

/** The entity that owns the ones a plan writes (a level's class), as the view has it. */
export interface PlanOwner {
  id: string;
  name: string;
  rulesetId: string;
}

/**
 * One save of an owner's progression (a class's levels at once): the owner as the view has it, the kind it owns
 * (`ownedType`), each owned entity it changes, by its place on the owner's track (`position`), with its edit and the
 * modifiers it adds and removes, what its activity records, and what refuses it when what it writes is gone.
 */
export interface ProgressionPlan {
  activity: Record<string, unknown>;
  /** What refuses the save when the owner or an owned entity it writes is gone since the view was read */
  gone: { owned: string; owner: string };
  owned: {
    added: { operator: string; target: string; value: string; valueType: "number" }[];
    edit?: OwnedEditPlan<object, object, { id: string }>;
    entity: { id: string };
    position: number;
    removedIds: string[];
  }[];
  ownedType: string;
  owner: PlanOwner;
}

/** A property a plan keeps a field in: its type and value, on the entity it writes. */
export interface PropertyValue {
  type: string;
  value: string;
}

/**
 * The rows of the joins from an entity a plan writes, by the join's name (a class level's granted feats), each row by
 * its join's columns but the one it's from, which the server fills: a join the plan leaves out it keeps.
 */
export type JoinRows = Record<string, Record<string, unknown>[] | undefined>;
