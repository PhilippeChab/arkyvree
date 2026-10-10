/**
 * What an entity kind's `plan*` operations answer: what the server writes of an entity's create, edit or delete, each a
 * named plan, by table, without ids it doesn't have yet: its row, its lists, what it writes beside it.
 */

import type { Modifier, Requirement } from "@/shared/relations.ts";

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

/** A property a plan keeps a field in: its type and value, on the entity it writes. */
export interface PropertyValue {
  type: string;
  value: string;
}
