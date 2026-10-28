/**
 * What an entity kind's `plan*` operations answer: what the server writes of an entity's create, edit or delete, each a
 * named plan, by type, without ids it doesn't have yet: its row as stored, its links, what it writes beside it.
 */

import type { EntityRecord, EntityWrite, FieldValue } from "@/engine/core/module/storage.ts";
import type { NamedLink, ViewLink } from "@/engine/core/view/index.ts";
import type { ActivityChange } from "@/shared/activity.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/**
 * What a create or an edit writes of an entity: its row (`row`: its own columns, the fields and the single links it
 * sets, as stored), its links of the roles it sets many of (`links`, each set replacing the entity's of its role and
 * kind; a role it leaves out: kept), what it writes beside its row, and what the action answers once written
 * (`describe`: its record, `row`, with its own links as stored, `links`, as a read describes it, its columns as the
 * record's type has them).
 */
interface EntitySave {
  describe: <R extends EntityRecord>(row: R, links: readonly ViewLink[]) => SavedEntity<R>;
  links?: LinkSet[];
  row: EntityWrite;
  writes?: EntityWrites;
}

/** A requirement a plan sets on an entity: what it asks of the character. */
type RequirementWrite = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/**
 * What a save answers: the entity's record once written (`R`), its fields as a read answers them (each as its kind
 * reads it, by its stored field, an item's template's it holds none of among them), its single links named as a read
 * names them.
 */
type SavedEntity<R extends EntityRecord> = Omit<R, "fields" | "links"> & {
  fields: Record<string, unknown>;
  links: NamedLink[];
};

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
 * What copies of an entity write (an item's variants): each copy's row (`EntityWrite`), whose customizations they copy
 * (`copyCustomizationsFrom`), and what each writes past its row, as a create's plan does: its links of the roles it
 * holds many of (`links`), and a requirement on it (`writes`). Only what each copy writes of its own: an entity made or
 * removed with one would be made twice, or removed again, with the next.
 */
export interface EntityCopiesPlan extends Pick<EntitySave, "links"> {
  copyCustomizationsFrom?: string;
  rows: EntityWrite[];
  writes?: Pick<EntityWrites, "requirement">;
}

/** What an entity's create writes, and whose customizations the new entity copies (`copyCustomizationsFrom`). */
export interface EntityCreatePlan extends EntitySave {
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
 * activity records it changes (`changes`, in its form's order: its name, its description, each field and single link it
 * writes another value of, each list of links it sets, its entries added and removed), and the copies that may refuse
 * it.
 */
export interface EntityEditPlan<E = { id: string; name: string }> extends EntitySave {
  changes: ActivityChange[];
  copies?: EntityCopies;
  entity: E;
}

/**
 * What a list of a kind's entities reads them by, past its ruleset's: the values of their fields (`fields`, one or one
 * of several each: 3.5's item's `ITEM_IS_TEMPLATE`, a feat's family), the targets of their single links (`links`, one
 * of several each: an item's template), their partition (`partitions`, one of: 3.5's race's `pc`), and the fields a
 * search finds an entity by as well as its own columns (`searchFields`, a text it holds there: 3.5's feat's family).
 */
export interface EntityFilters {
  fields?: Readonly<Record<string, FieldValue | readonly FieldValue[]>>;
  links?: Readonly<Record<string, readonly string[]>>;
  partitions?: readonly string[];
  searchFields?: readonly string[];
}

/**
 * An entity a plan removes with the one it writes (`type`, its kind, and its `id`): refused (`inUse`) while a
 * character of the ruleset picked it.
 */
export interface EntityRemoval {
  id: string;
  inUse: string;
  type: string;
}

/**
 * What an entity's form writes beside its row, as its ruleset's rules say: a requirement on it, and the entities it
 * makes and removes with it (`made`, `removed`). The server writes each by its type.
 */
export interface EntityWrites {
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
 * An entity a plan makes with the one it writes, in the same ruleset: its type (`type`), its row (`EntityWrite`: its
 * fields and its single links among it), its links of the roles it holds many of (`links`, by role), and its
 * modifiers and requirements.
 */
export interface MadeEntity {
  links: LinkSet[];
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  requirements: RequirementWrite[];
  row: EntityWrite & { description: string; name: string };
  type: string;
}

/**
 * What an owned entity's create writes past an entity's: its owner, what its activity records, and what it's refused
 * with when its owner holds another at its place (`taken`: one written since the view was read, which the view's check
 * missed).
 */
export interface OwnedCreatePlan extends EntityCreatePlan {
  activity: Record<string, unknown>;
  owner: PlanOwner;
  taken: string;
}

/** What an owned entity's delete writes past an entity's: its owner, and what its activity records. */
export interface OwnedDeletePlan<E = { id: string; name: string }> extends EntityDeletePlan<E> {
  activity: Record<string, unknown>;
  owner: PlanOwner;
}

/** What an owned entity's edit writes past an entity's: its owner, and what its activity records. */
export interface OwnedEditPlan<E = { id: string; name: string }> extends EntityEditPlan<E> {
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
 * modifiers it adds and removes, and what its activity records. What refuses it when what it writes is gone since the
 * view was read is the server's, named in the rules' words (`Engine.rules().labelOf`).
 */
export interface ProgressionPlan {
  activity: Record<string, unknown>;
  owned: {
    added: { operator: string; target: string; value: string; valueType: "number" }[];
    edit?: OwnedEditPlan<{ id: string }>;
    entity: { id: string };
    position: number;
    removedIds: string[];
  }[];
  ownedType: string;
  owner: PlanOwner;
}
