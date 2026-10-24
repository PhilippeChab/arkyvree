/**
 * The parts of an entity a kind may have past its own row, each bound to the entity as the view has it: the entities it
 * owns (a class's levels), the join it edits (a class's skills), its progression (its owned entities' at once) and its
 * tables. A kind that has none of one has it refused as not found (`RulesetEngine`'s `part`).
 */

import type { EntityForm } from "@/engine/core/fields/index.ts";
import type {
  LinkAddPlan,
  LinkRemovePlan,
  OwnedCreatePlan,
  OwnedDeletePlan,
  OwnedEditPlan,
  PlanOwner,
  ProgressionPlan,
} from "@/engine/core/module/index.ts";

/** The links an entity edits through a join (a class's skills): described, and what adding or removing one writes. */
export interface EntityLinks {
  describe(): unknown;
  planAdd(toId: string): LinkAddPlan;
  planRemove(toId: string): LinkRemovePlan;
}

/** An entity's progression (a class's levels at once): what its tabs read, and what one save of them writes. */
export interface EntityProgression {
  describe(): unknown;
  plan(sent: unknown): ProgressionPlan & { owner: PlanOwner & { updatedAt: string } };
}

/** An entity's tables, by name (a class's spells per day): each described. */
export interface EntityTables {
  describe(table: string): unknown;
}

/**
 * The entities an entity owns, of their kind (`type`: a class's levels): one described, all of them, and what saving
 * or deleting one writes.
 */
export interface OwnedEntities {
  describe(id: string): unknown;
  describeAll(): unknown;
  planCreate(form: EntityForm): OwnedCreatePlan<object, object>;
  planDelete(id: string): OwnedDeletePlan<{ id: string }>;
  planEdit(id: string, form: EntityForm): OwnedEditPlan<object, object, { id: string }>;
  readonly type: string;
}
