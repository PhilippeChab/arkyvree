import { getTableName, type Table } from "drizzle-orm";

import type { EntityCreatePlan, EntityDeletePlan, EntityEditPlan, EntityWrites } from "@/engine/index.ts";
import {
  CustomizationCopies,
  EntityEdit,
  EntityNames,
  type RulesetScope,
  RulesetViews,
  withRulesetScope,
} from "@/server/cow/index.ts";
import { type Db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import type { RulesetEntityType } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { isCustomizableEntityType, PROPERTY_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import type { Session } from "@/shared/relations.ts";

import { hasCharacterPicks } from "./characterPicks.ts";
import { writeEntityWrites } from "./entityWrites.ts";
import { createListLinks, setListLinks } from "./listLinks.ts";

/** What a delete adds of its kind's: what else uses an entity, and what else refuses its delete. */
interface DeleteChecks<P> {
  /** Whether the entity is in use, which refuses its delete: picked by a character, unless the kind says otherwise. */
  inUse?: (tx: Db, scope: RulesetScope) => Promise<boolean>;
  /** Refuses the delete the plan plans, by what the kind reads of it (an item template's copies). */
  refuse?: (tx: Db, plan: P) => Promise<void>;
}

/** A kind's table, as its creates, updates and deletes write it. */
interface KindRepository<Row, Insert> {
  create(db: Db, values: Insert): Promise<Row[]>;
  delete(db: Db, where: { id: string }): Promise<Row[]>;
  update(db: Db, values: Partial<Insert>, where: { expectedUpdatedAt?: string; id: string }): Promise<Row[]>;
}

/** An entity a plan names, as the view has it. */
type PlannedEntity = { id: string; name: string; rulesetId: string };

/**
 * A ruleset entity kind's writer (`type`, its table and repository): the steps every kind's create, update and delete
 * take, in one order, around the plan its rules give (`Engine.for(scope).entities(type)`). A create checks access,
 * keeps the name free (taking over a deleted copy's tombstone), writes the row, its list links, what the plan writes
 * beside it and the customizations it copies. An update writes the row the view's entity resolves to (its copy, made on
 * its first edit), refused when stale. A delete is refused while the entity is in use. Each records its activity, and
 * the ruleset's views drop what it changed.
 */
export default class EntityWriter<Row extends { id: string; name: string }, Insert extends { rulesetId: string }> {
  constructor(
    private readonly type: RulesetEntityType,
    private readonly repository: KindRepository<Row, Insert>,
    private readonly table: Table,
    /** Its activities' name: `Feat` in `createFeat`. */
    private readonly activityName: string,
  ) {}

  /** The entity's customizations, copied onto the new one (`entityId`) from `sourceId`'s. */
  private async copyCustomizations(tx: Db, entityId: string, sourceId: string) {
    const sourceType = isCustomizableEntityType(this.type) ? this.type : undefined;
    const customizations = (await CustomizationCopies.read(tx, [sourceId], this.type, sourceType)).get(sourceId);
    if (customizations) await CustomizationCopies.copy(tx, entityId, this.type, customizations);
  }

  /** Records what a create, an update or a delete did to the entity (`verb`), with what the activity carries. */
  private async recordActivity(
    tx: Db,
    session: Session,
    verb: "create" | "delete" | "update",
    targetId: string,
    data: Record<string, unknown>,
  ) {
    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId,
      targetTable: getTableName(this.table),
      type: `${verb}${this.activityName}`,
      data,
    });
  }

  /** What a plan writes beside the entity: its properties, its requirement, the entities it makes and removes. */
  private async writeBeside(tx: Db, scope: RulesetScope, entityId: string, writes: EntityWrites | undefined) {
    if (!writes) return;
    const entityType = PROPERTY_ENTITY_TYPES.find((type) => type === this.type);
    if (!entityType) throw new Error(`A ${this.type} entity keeps no properties`);
    await writeEntityWrites(tx, scope, { entityId, entityType }, writes);
  }

  /**
   * A new entity in the ruleset (`name`, which must be free in its view), as its rules plan it (`plan`, given the
   * ancestor whose deleted copy's tombstone the new entity takes over, and the transaction to read what the plan needs):
   * the row written, with the fields the plan keeps.
   */
  async create<P extends EntityCreatePlan<Omit<Insert, "rulesetId">>>(
    session: Session,
    rulesetId: string,
    name: string,
    plan: (scope: RulesetScope, reads: { tombstoneAncestorId: string | null; tx: Db }) => P | Promise<P>,
  ): Promise<Row & P["fields"]> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, this.type, name);
          const planned = await plan(scope, { tombstoneAncestorId, tx });

          // The plan's columns, in the ruleset: a kind's insert, which only the generic spread can't prove
          const [row] = await this.repository.create(tx, { ...planned.columns, rulesetId } as Insert);
          if (tombstoneAncestorId) await names.repointTombstone(tx, this.type, tombstoneAncestorId, row.id);
          await createListLinks(tx, this.type, row.id, planned.links ?? []);
          await this.writeBeside(tx, scope, row.id, planned.writes);
          if (planned.copyCustomizationsFrom) await this.copyCustomizations(tx, row.id, planned.copyCustomizationsFrom);

          await this.recordActivity(tx, session, "create", row.id, { entityName: row.name });
          return { ...row, ...planned.fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  /**
   * An entity's delete (`entityId`), as its rules plan it (`plan`): refused while it's in use (picked by a character,
   * unless its kind says otherwise: `checks`), the row the view's entity resolves to deleted, and what the plan writes
   * with it (the entities it removes). Answers the deleted row.
   */
  async delete<P extends EntityDeletePlan<PlannedEntity>>(
    session: Session,
    rulesetId: string,
    entityId: string,
    plan: (scope: RulesetScope) => P,
    checks: DeleteChecks<P> = {},
  ): Promise<Row> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          const inUse = checks.inUse
            ? await checks.inUse(tx, scope)
            : await hasCharacterPicks(tx, this.type, rulesetData.cow.getEquivalentIds(entityId), rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const planned = plan(scope);
          await checks.refuse?.(tx, planned);
          const targetId = await new EntityEdit(ruleset).cowToDelete(tx, this.type, planned.entity);
          await this.writeBeside(tx, scope, targetId, planned.writes);

          // The database deletes its links and customizations with it.
          const [row] = await this.repository.delete(tx, { id: targetId });
          await this.recordActivity(tx, session, "delete", targetId, {
            rulesetId,
            entityName: planned.entity.name,
          });
          return row;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  /**
   * An entity's update, as its rules plan it (`plan`) from its form (`body`): the row the view's entity resolves to (the
   * ruleset's own, or its copy, made on its first edit) updated, refused when stale (`body.updatedAt`, a copy's never
   * is), its list links replaced, and what the plan writes beside it. The row written, with the fields the plan keeps.
   */
  async update<P extends EntityEditPlan<Partial<Insert>, object, PlannedEntity>>(
    session: Session,
    rulesetId: string,
    body: { name: string; updatedAt?: string },
    plan: (scope: RulesetScope) => P,
    /** What its activity compares with the entity it was, for its changed fields: the body, unless the row says better. */
    compare: (row: Row) => object = () => body,
  ): Promise<Row & P["fields"]> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canUpdateEntity();

          const planned = plan(scope);
          const { id: targetId, copied } = await new EntityEdit(scope.ruleset).cowToEdit(tx, this.type, planned.entity);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;
          const rows = await this.repository.update(tx, planned.columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          await setListLinks(tx, this.type, targetId, planned.links);
          await this.writeBeside(tx, scope, targetId, planned.writes);

          const [row] = rows;
          await this.recordActivity(tx, session, "update", targetId, {
            entityName: body.name,
            changedFields: getChangedFields(planned.entity, compare(row)),
          });
          return { ...row, ...planned.fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}
