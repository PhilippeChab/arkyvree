import type { Db } from "@/drizzle/database.ts";
import type { EntityCreatePlan, EntityDeletePlan, EntityEditPlan, EntityForm, EntityWrites } from "@/engine/index.ts";
import {
  CustomizationCopies,
  EntityEdit,
  EntityNames,
  type RulesetScope,
  RulesetViews,
  withRulesetScope,
} from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  CUSTOMIZABLE_TYPES,
  Entities,
  EntityLinks,
  type EntityRow,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

import { hasCharacterPicks } from "./characterPicks.ts";
import { writeEntityWrites } from "./entityWrites.ts";
import { createLinks, setLinks } from "./linkWrites.ts";

/** An entity a plan names, as the view has it. */
interface PlannedEntity {
  id: string;
  name: string;
  rulesetId: string;
}

/** A kind's row, as a write answers it (`Entities`). */
type Row = EntityRow & { description: string | null; name: string; rulesetId: string; updatedAt: string };

/**
 * A ruleset entity's form, as its route carries it (`entityBody`): its name, when it was last read (an update's), and
 * its columns, which its kind's rules read by their descriptions.
 */
export type EntityBody = EntityForm & { name: string; updatedAt?: string };

/**
 * A ruleset entity kind's writer (`type`): the steps every kind's create, update and delete
 * take, in one order, around the plan its rules give (`Engine.for(scope).entities(type)`). A create checks access,
 * keeps the name free (taking over a deleted copy's tombstone), writes the row, its list links, the customizations it
 * copies and what the plan writes beside it (its fields, over the stored values it copied). An update keeps a
 * new name free as a create does, and writes the row the view's entity resolves to (its copy, made on its first edit),
 * refused when stale. A delete is refused while the entity is in use. Each first opens the kind's rules for its action
 * (`open`), records its activity, and the ruleset's views drop what it changed.
 */
export default class EntityWriter {
  constructor(
    private readonly type: RulesetEntityType,
    /**
     * Opens the kind's rules for the action, first of all its steps: an action the kind has none of (an ability's
     * create) refused before its access, name and in-use checks.
     */
    private readonly open: (scope: RulesetScope) => unknown = () => undefined,
  ) {}

  /** The entity's customizations, copied onto the new one (`entityId`) from `sourceId`'s. */
  private async copyCustomizations(tx: Db, entityId: string, sourceId: string) {
    const sourceType = CUSTOMIZABLE_TYPES.includes(this.type) ? this.type : undefined;
    const customizations = (await CustomizationCopies.read(tx, [sourceId], this.type, sourceType)).get(sourceId);
    if (customizations) await CustomizationCopies.copy(tx, entityId, this.type, customizations);
  }

  /**
   * Whether an entity (`entityId`) is in use, which refuses its delete: linked to by a link of a role that refuses its
   * delete (a class level's base bonus to a save: the database would refuse it, this answers why), or picked by a
   * character.
   */
  private async inUse(tx: Db, { ruleset, rulesetData }: RulesetScope, entityId: string) {
    if (await EntityLinks.hasRefusing(tx, { toId: rulesetData.cow.resolve(entityId), toType: this.type })) return true;
    return await hasCharacterPicks(tx, this.type, rulesetData.cow.getEquivalentIds(entityId), ruleset.id);
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
      targetTable: this.type,
      type: `${verb}${getActivityName(this.type)}`,
      data,
    });
  }

  /** What a plan writes beside the entity: its stored values, its requirement, the entities it makes and removes. */
  private async writeBeside(tx: Db, scope: RulesetScope, entityId: string, writes: EntityWrites | undefined) {
    if (writes) await writeEntityWrites(tx, scope, { entityId, entityType: this.type }, writes);
  }

  /**
   * A new entity in the ruleset (`name`, which must be free in its view), as its rules plan it (`plan`, given the
   * ancestor whose deleted copy's tombstone the new entity takes over, and the transaction to read what the plan needs):
   * the row written, with the fields the plan keeps.
   */
  async create<P extends EntityCreatePlan<object>>(
    session: Session,
    rulesetId: string,
    name: string,
    plan: (scope: RulesetScope, reads: { tombstoneAncestorId: string | null; tx: Db }) => P | Promise<P>,
  ): Promise<Row & P["fields"]> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          this.open(scope);
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, this.type, name);
          const planned = await plan(scope, { tombstoneAncestorId, tx });

          const [row] = await Entities.create<Row>(tx, this.type, { ...planned.columns, rulesetId });
          if (tombstoneAncestorId) await names.repointTombstone(tx, this.type, tombstoneAncestorId, row.id);
          await createLinks(tx, { entityId: row.id, entityType: this.type }, planned.links ?? []);
          // The customizations it copies first: the fields the plan writes replace the stored values it copied
          if (planned.copyCustomizationsFrom) await this.copyCustomizations(tx, row.id, planned.copyCustomizationsFrom);
          await this.writeBeside(tx, scope, row.id, planned.writes);

          await this.recordActivity(tx, session, "create", row.id, { entityName: row.name });
          return { ...row, ...planned.fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  /**
   * An entity's delete (`entityId`), as its rules plan it (`plan`, given the transaction to read what the plan needs):
   * refused while it's in use (`inUse`), the row the view's entity resolves to deleted, and what the plan writes with
   * it (the entities it removes). Answers the deleted row.
   */
  async delete<P extends EntityDeletePlan<PlannedEntity>>(
    session: Session,
    rulesetId: string,
    entityId: string,
    plan: (scope: RulesetScope, reads: { tx: Db }) => P | Promise<P>,
  ): Promise<Row> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;
          this.open(scope);
          const inUse = await this.inUse(tx, scope, entityId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const planned = await plan(scope, { tx });
          const targetId = await new EntityEdit(ruleset).cowToDelete(tx, this.type, planned.entity);
          await this.writeBeside(tx, scope, targetId, planned.writes);

          // The database deletes its links and customizations with it.
          const [row] = await Entities.delete<Row>(tx, { entityType: this.type, id: targetId });
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
   * An entity's update, as its rules plan it (`plan`, given the transaction to read what the plan needs) from its form
   * (`body`): a new name kept free in its view, as a create's is, the row the view's entity resolves to (the ruleset's
   * own, or its copy, made on its first edit) updated, refused when stale (`body.updatedAt`, a copy's never is), its
   * list links replaced, and what the plan writes beside it. The row written, with the fields the plan keeps.
   */
  async update<P extends EntityEditPlan<object, object, PlannedEntity>>(
    session: Session,
    rulesetId: string,
    body: { name: string; updatedAt?: string },
    plan: (scope: RulesetScope, reads: { tx: Db }) => P | Promise<P>,
  ): Promise<Row & P["fields"]> {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          this.open(scope);
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const planned = await plan(scope, { tx });
          await new EntityNames(ruleset, rulesetData.cow).assertRenameAvailable(
            tx,
            this.type,
            planned.entity,
            body.name,
          );
          const { id: targetId, copied } = await new EntityEdit(ruleset).cowToEdit(tx, this.type, planned.entity);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;
          const rows = await Entities.update<Row>(
            tx,
            this.type,
            { ...planned.columns },
            { id: targetId, expectedUpdatedAt },
          );
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          await setLinks(tx, { entityId: targetId, entityType: this.type }, planned.links);
          await this.writeBeside(tx, scope, targetId, planned.writes);

          const [row] = rows;
          await this.recordActivity(tx, session, "update", targetId, {
            entityName: body.name,
            // The columns its plan writes, never the body, whose other keys it doesn't
            changedFields: getChangedFields(planned.entity, planned.columns),
          });
          return { ...row, ...planned.fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}
