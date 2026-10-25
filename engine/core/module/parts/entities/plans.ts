/**
 * What an entity kind's `plan*` operations answer: what the server writes of an entity's create, edit or delete, each a
 * named plan, by table, without ids it doesn't have yet: its row as stored, its links, what it writes beside it.
 */

import type { FieldsWrite } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite, FieldValue } from "@/engine/core/module/storage.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/**
 * What a create or an edit writes of an entity: its row (`row`: its own columns, its own fields and its single links, as
 * stored), its links of the roles it sets many of (`links`, each set replacing the entity's of its role and kind; a
 * role it leaves out: kept), what it writes beside its row, and the fields the entity keeps once written (`F`, which the
 * action answers with its row).
 */
interface EntitySave<F> {
  fields: F;
  links?: LinkSet[];
  row: EntityWrite;
  writes?: EntityWrites;
}

/** A requirement a plan sets on an entity: what it asks of the character. */
type RequirementWrite = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/**
 * The entities made from the one a plan writes, which the plan reaches (a template's copies): what the server reads
 * them with (`filters`), where the plan reaches them (the ruleset's view, and the rulesets built on it), and what
 * refuses the plan by them (`check`).
 */
export interface EntityCopies {
  check(copies: EntityRecord[]): void;
  filters: EntityFilters;
}

/**
 * What copies of an entity write (an item's variants): each copy's row (`EntityWrite`), and whose customizations they
 * copy (`copyCustomizationsFrom`).
 */
export interface EntityCopiesPlan {
  copyCustomizationsFrom?: string;
  rows: EntityWrite[];
}

/** What an entity's create writes, and whose customizations the new entity copies (`copyCustomizationsFrom`). */
export interface EntityCreatePlan<F = object> extends EntitySave<F> {
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
 * What an entity's edit writes: the entity as the view has it (`E`), its new row and what goes beside it, what its
 * activity compares (`changes`: the entity's values and the form's, by the form's keys: its name, its description, its
 * columns), and the copies that may refuse it.
 */
export interface EntityEditPlan<F = object, E = { id: string; name: string }> extends EntitySave<F> {
  changes: { after: Record<string, unknown>; before: Record<string, unknown> };
  copies?: EntityCopies;
  entity: E;
}

/**
 * What a list of a kind's entities reads them by, past its ruleset's: the values of their fields (`fields`, one or one
 * of several each: 3.5's item's `ITEM_IS_TEMPLATE`, a feat's family), the targets of their single links (`links`, one
 * of several each: an item's template), their partition (`partitions`, one of: 3.5's race's `pc`).
 */
export interface EntityFilters {
  fields?: Readonly<Record<string, FieldValue | readonly FieldValue[]>>;
  links?: Readonly<Record<string, readonly string[]>>;
  partitions?: readonly string[];
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
 * What an entity's form writes beside its row, as its ruleset's rules say: its stored values its fields are kept in
 * (`fields`, each field and link role it names replaced; none: those it has stay), a requirement on it, and the
 * entities it makes and removes with it (`made`, `removed`). The server writes each by its table.
 */
export interface EntityWrites {
  fields?: FieldsWrite;
  made?: MadeEntity[];
  removed?: EntityRemoval[];
  requirement?: RequirementWrite;
}

/**
 * Adding a link of the role its owner edits one at a time (a class's skills): the owner as the view has it, the link
 * from it (`link`: its role, its target), and what its activity records (`activity`).
 */
export interface LinkAddPlan {
  activity: Record<string, unknown>;
  link: LinkWrite;
  owner: PlanOwner;
}

/**
 * Removing a link of the role its owner edits one at a time: the owner, the link's role and target, and what its
 * activity records.
 */
export interface LinkRemovePlan {
  activity: Record<string, unknown>;
  owner: PlanOwner;
  role: string;
  toId: string;
}

/**
 * The links of a role to a kind (`role`, `toType`) a plan sets on an entity, in their order, replacing those it held
 * (a feat's pools, a class level's grants): each its target, and its pool, tier, amount and whether it's free when it
 * holds them.
 */
export interface LinkSet {
  links: Omit<LinkWrite, "role" | "toType">[];
  role: string;
  toType: string;
}

/**
 * A link a plan writes from an entity: its role, its target (`toId`, of `toType`), and the pool it's taken through
 * (`viaId`), its tier, its amount and whether it's free, when it holds them.
 */
export interface LinkWrite {
  amount?: number | null;
  free?: boolean;
  role: string;
  tier?: number | null;
  toId: string;
  toType: string;
  viaId?: string | null;
}

/**
 * An entity a plan makes with the one it writes, in the same ruleset: its table (`type`), its row (`EntityWrite`), its
 * stored values (`fields`), its links (`links`, by role), and its modifiers and requirements.
 */
export interface MadeEntity {
  fields: FieldsWrite;
  links: LinkSet[];
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  requirements: RequirementWrite[];
  row: EntityWrite & { description: string; name: string };
  type: string;
}

/** What an owned entity's create writes past an entity's: its owner, and what its activity records. */
export interface OwnedCreatePlan<F = object> extends EntityCreatePlan<F> {
  activity: Record<string, unknown>;
  owner: PlanOwner;
}

/** What an owned entity's delete writes past an entity's: its owner, and what its activity records. */
export interface OwnedDeletePlan<E = { id: string; name: string }> extends EntityDeletePlan<E> {
  activity: Record<string, unknown>;
  owner: PlanOwner;
}

/** What an owned entity's edit writes past an entity's: its owner, and what its activity records. */
export interface OwnedEditPlan<F = object, E = { id: string; name: string }> extends EntityEditPlan<F, E> {
  activity: Record<string, unknown>;
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
    edit?: OwnedEditPlan<object, { id: string }>;
    entity: { id: string };
    position: number;
    removedIds: string[];
  }[];
  ownedType: string;
  owner: PlanOwner;
}
