/**
 * The parts of an entity a kind may have past its own row, each bound to the entity as the view has it: the entities it
 * owns (a class's levels), the links of a role it edits one at a time (a class's skills), the lists its owned entities
 * count entities on (a class's spell lists), its progression (its owned entities' at once) and its tables. A kind that
 * has none of one has it refused as not found (`RulesetEngine`'s `part`).
 */

import type { EntityForm } from "@/engine/core/fields/index.ts";
import type {
  FeatureCreatePlan,
  LinkAddPlan,
  LinkRemovePlan,
  ListEntriesPlan,
  OwnedCreateManyPlan,
  OwnedCreatePlan,
  OwnedDeletePlan,
  OwnedEditPlan,
  PlanOwner,
  ProgressionPlan,
} from "@/engine/core/module/index.ts";

/**
 * The links of a role an entity edits one at a time (a class's skills): described, and what adding or removing one
 * writes.
 */
export interface EntityLinks {
  describe(): unknown;
  planAdd(toId: string): LinkAddPlan;
  planRemove(toId: string): LinkRemovePlan;
}

/**
 * The lists an entity's owned entities count entities on (a class's spell lists, each of spells): what adding entities
 * to one at a tier (`tier`: a spell's level on it; `listId` none: the entity's own list, made first where its ruleset
 * has none), or removing one from it, writes on those entities.
 */
export interface EntityLists {
  planAdd(listId: string | undefined, targetIds: string[], tier: number | undefined): ListEntriesPlan;
  planRemove(listId: string, targetId: string): ListEntriesPlan;
}

/**
 * An entity's progression (a class's levels at once): what its tabs read, what one save of them would leave its tables
 * at, unwritten (`describePlan`: its tables' tab's draft), what one save of them writes, and what creating a feature
 * its owned entities can grant writes (`planFeature`: 3.5's class feature, named for its class, in its feature pool),
 * and the name such a feature takes and whether it exists (`describeNewFeature`, as its picker offers to create it).
 */
export interface EntityProgression {
  describe(): unknown;
  describeNewFeature(name: string): { exists: boolean; name: string };
  describePlan(sent: unknown): unknown;
  plan(sent: unknown): ProgressionPlan & { owner: PlanOwner & { updatedAt: string } };
  planFeature(name: string): FeatureCreatePlan;
}

/** An entity's tables, by name (a class's spells per day): each described. */
export interface EntityTables {
  describe(table: string): unknown;
}

/**
 * The entities an entity owns, of their kind (`type`: a class's levels): one described, all of them, and what saving
 * or deleting one writes, and creating several at once.
 */
export interface OwnedEntities {
  describe(id: string): unknown;
  describeAll(): unknown;
  planCreate(form: EntityForm): OwnedCreatePlan;
  planCreateMany(forms: readonly EntityForm[]): OwnedCreateManyPlan;
  planDelete(id: string): OwnedDeletePlan<{ id: string }>;
  planEdit(id: string, form: EntityForm): OwnedEditPlan<{ id: string }>;
  readonly type: string;
}
