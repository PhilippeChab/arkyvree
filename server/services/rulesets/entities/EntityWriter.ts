import type { Db } from "@/drizzle/database.ts";
import {
  Engine,
  type EntityCreatePlan,
  type EntityDeletePlan,
  type EntityEditPlan,
  type EntityForm,
  type EntityRecord,
  type EntityRemoval,
  type EntityWrites,
  type LinkSet,
  type MadeEntity,
} from "@/engine/index.ts";
import {
  CustomizationCopies,
  type EditTarget,
  EntityEdit,
  EntityNames,
  EntityUses,
  type NotFoundMessages,
  type RulesetScope,
  RulesetViews,
} from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Entities,
  EntityLinks,
  Modifiers,
  type ReferencedType,
  Requirements,
  RULESET_ENTITY_TYPES,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { Session } from "@/shared/relations.ts";

/** An owned entity's plan, as its owner's rules give it, and the owned entity's type (a class level's). */
interface OwnedPlanned<P> {
  plan: P;
  type: string;
}

/** An entity a plan names, as the view has it. */
interface PlannedEntity {
  id: string;
  name: string;
  rulesetId: string;
}

/** What a save writes of an entity beside its row: its links of the roles it holds many of, and its side writes. */
interface SavedParts {
  links?: LinkSet[];
  writes?: EntityWrites;
}

/** An entity a write names: its id, of its type. */
interface WrittenEntity {
  entityId: string;
  entityType: string;
}

/** An owned entity's plan: what its activity carries beside the plan. */
type OwnedPlan<P> = P & { activity: Record<string, unknown> };

/** An entity as a write answers it: its record as written (`Entities`), named. */
type Row = EntityRecord & { name: string };

/**
 * A ruleset entity's form, as its route carries it (`entityBody`): its name, when it was last read (an update's), and
 * its fields and links, which its kind's rules read by their descriptions.
 */
export type EntityBody = EntityForm & { name: string; updatedAt?: string };

/** An entity's type, as a plan names it: refused when it isn't a ruleset entity's. */
function entityTypeOf(type: string): RulesetEntityType {
  const entityType = RULESET_ENTITY_TYPES.find((known) => known === type);
  if (!entityType) throw new Error(`A save cannot write a ${type} entity`);
  return entityType;
}

/** The links a set holds, each from the entity. */
function linksOf(entity: WrittenEntity, { links, role, toType }: LinkSet) {
  return links.map((link) => ({ ...link, fromId: entity.entityId, fromType: entity.entityType, role, toType }));
}

/**
 * Writes a save of an entity as its rules plan it, every kind's and every save's in one order and by one rule: a
 * ruleset entity's create, update and delete (`type`), and those of the entities it owns (its class levels, by
 * `createOwned`, `updateOwned` and `deleteOwned`), each in its transaction and its ruleset's scope. A save checks
 * access, keeps a name free (a create's, taking over a deleted copy's tombstone, and a rename's), and writes the row
 * copy-on-write resolves (`EntityEdit`: the ruleset's own, or the copy of an inherited one, made on its first edit; an
 * owned entity's on its owner's): refused as not found when it's gone since the view was read, and as stale when the
 * client's token is behind (a copy's never is). Then its links (`setLinks`), then what its plan writes beside it
 * (`writeBeside`: the entities it removes, a requirement, the entities it makes). A delete is refused while the entity
 * is in use (`EntityUses`). Each first opens the kind's rules for its action (`open`), records its activity (its verb
 * and the written kind's name), and the ruleset's views drop what it changed.
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

  /** What an entity's write (of `type`) refuses it with when it's missing, or deleted since the view was read. */
  private static notFoundOf(type: string): NotFoundMessages {
    const message = `${getActivityName(type)} not found`;
    return { gone: message, missing: message };
  }

  /**
   * Runs a save in its transaction and its ruleset's scope, with the session's policy on it, if the session may read it
   * (`withReadableRuleset`), the ruleset's views dropping what it changed.
   */
  private static async inScope<T>(
    session: Session,
    rulesetId: string,
    save: (tx: Db, scope: RulesetScope, policy: RulesetsPolicy) => Promise<T>,
  ): Promise<T> {
    const result = await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => await save(tx, scope, policy)),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  /**
   * An entity a plan makes, in the scope's ruleset: its row (its fields and single links among it), its links, its
   * modifiers and its requirements.
   */
  private static async makeEntity(tx: Db, scope: RulesetScope, made: MadeEntity) {
    const type = entityTypeOf(made.type);
    const [entity] = await Entities.create(tx, type, { ...made.row, rulesetId: scope.ruleset.id });
    const written = { entityId: entity.id, entityType: type };
    await EntityWriter.setLinks(tx, written, made.links, false);
    await Modifiers.createMany(
      tx,
      made.modifiers.map((modifier) => ({ ...modifier, sourceId: entity.id, sourceType: type })),
    );
    await Requirements.createMany(
      tx,
      made.requirements.map((requirement) => ({ ...written, ...requirement })),
    );
  }

  /** Records what a save did to an entity of a kind (`type`, by `verb`), with what the activity carries. */
  private static async recordActivity(
    tx: Db,
    session: Session,
    verb: "create" | "delete" | "update",
    type: string,
    targetId: string,
    data: Record<string, unknown>,
  ) {
    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId,
      targetType: type,
      type: `${verb}${getActivityName(type)}`,
      data,
    });
  }

  /**
   * An entity a plan removes, refused while a character picked it. Deleting the ruleset's copy of an inherited one leaves
   * a tombstone snapshot: it disappears from the ruleset while its ancestor stays intact. A hard delete: the database
   * deletes its links and customizations with it, and a soft-archive would block an entity of the same name made later.
   */
  private static async removeEntity(tx: Db, { ruleset, rulesetData }: RulesetScope, removal: EntityRemoval) {
    const type = entityTypeOf(removal.type);
    if (await new EntityUses(ruleset, rulesetData.cow).isPicked(tx, type, removal.id))
      throw new ConflictError(removal.inUse);

    const notFound = EntityWriter.notFoundOf(type);
    const target = await new EntityEdit(ruleset, rulesetData.cow).cowById(tx, type, removal.id, notFound);
    await Entities.delete(tx, { entityType: type, id: target.id });
  }

  /**
   * Updates the row a write targets (`target`) to the plan's (`row`, of `type`): refused as stale when the client's
   * token (`updatedAt`) is behind, a copy's never being checked (its token is its source's), and as not found when the
   * row was deleted since the view was read.
   */
  private static async updateRow(
    tx: Db,
    type: string,
    row: Parameters<typeof Entities.update>[2],
    target: EditTarget,
    updatedAt: string | undefined,
  ): Promise<Row> {
    const expectedUpdatedAt = target.copied ? undefined : updatedAt;
    const rows = await Entities.update<Row>(tx, type, row, { id: target.id, expectedUpdatedAt });
    if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);
    // A row deleted since the view was read: no token to call it stale by
    if (rows.length === 0) throw new NotFoundError(EntityWriter.notFoundOf(type).gone);
    return rows[0];
  }

  /**
   * Writes what a plan writes beside an entity (`writes`): the entities it removes, a requirement on it, and the
   * entities it makes.
   */
  private static async writeBeside(tx: Db, scope: RulesetScope, entity: WrittenEntity, writes: EntityWrites) {
    for (const removal of writes.removed ?? []) await EntityWriter.removeEntity(tx, scope, removal);
    if (writes.requirement) await Requirements.create(tx, { ...entity, ...writes.requirement });
    for (const made of writes.made ?? []) await EntityWriter.makeEntity(tx, scope, made);
  }

  /**
   * Writes the links a plan sets on an entity, each set in its order, at once: on an entity it had written before
   * (`replacing`: an edit's), each set replaces the entity's links of its role to its kind, and a role it leaves out
   * keeps its links (none given: every one). A new entity holds none to replace.
   */
  static async setLinks(tx: Db, entity: WrittenEntity, sets: LinkSet[] | undefined, replacing: boolean) {
    if (!sets?.length) return;
    if (replacing) {
      for (const set of sets)
        await EntityLinks.delete(tx, { fromId: entity.entityId, role: set.role, toType: set.toType });
    }
    await EntityLinks.createMany(
      tx,
      sets.flatMap((set) => linksOf(entity, set)),
    );
  }

  /**
   * Writes what a save of an entity writes past its row, in the one order every save takes: its links (`replacing`
   * those it held, an edit's: `setLinks`), then what its plan writes beside it.
   */
  static async setParts(tx: Db, scope: RulesetScope, entity: WrittenEntity, parts: SavedParts, replacing: boolean) {
    await EntityWriter.setLinks(tx, entity, parts.links, replacing);
    if (parts.writes) await EntityWriter.writeBeside(tx, scope, entity, parts.writes);
  }

  /** The entity's customizations, copied onto the new one (`entityId`) from `sourceId`'s. */
  private async copyCustomizations(tx: Db, entityId: string, sourceId: string) {
    const sourceType = Engine.storage().customizableKinds().includes(this.type) ? this.type : undefined;
    const customizations = (await CustomizationCopies.read(tx, [sourceId], this.type, sourceType)).get(sourceId);
    if (customizations) await CustomizationCopies.copy(tx, entityId, this.type, customizations);
  }

  /**
   * A new entity in the ruleset (`name`, which must be free in its view), as its rules plan it (`plan`, given the
   * ancestor whose deleted copy's tombstone the new entity takes over, and the transaction to read what the plan needs):
   * what its plan answers once written (`describe`: the row, with its links as stored).
   */
  async create<P extends EntityCreatePlan>(
    session: Session,
    rulesetId: string,
    name: string,
    plan: (scope: RulesetScope, reads: { tombstoneAncestorId: string | null; tx: Db }) => P | Promise<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      this.open(scope);
      policy.canUpdateEntity();

      const names = new EntityNames(ruleset, rulesetData.cow);
      const { tombstoneAncestorId } = await names.assertNameAvailable(tx, this.type, name);
      const planned = await plan(scope, { tombstoneAncestorId, tx });

      const [row] = await Entities.create<Row>(tx, this.type, { ...planned.row, rulesetId });
      if (tombstoneAncestorId) await names.repointTombstone(tx, this.type, tombstoneAncestorId, row.id);
      const written = { entityId: row.id, entityType: this.type };
      // The customizations it copies, before what the plan writes beside it
      if (planned.copyCustomizationsFrom) await this.copyCustomizations(tx, row.id, planned.copyCustomizationsFrom);
      await EntityWriter.setParts(tx, scope, written, planned, false);

      await EntityWriter.recordActivity(tx, session, "create", this.type, row.id, { entityName: row.name });
      return planned.describe(row, await EntityLinks.findOwn(tx, row.id));
    });
  }

  /**
   * A new entity an entity owns, as its owner's rules plan it (`plan`: the plan and the owned entity's type): its owner
   * copied when it's inherited (the new row would otherwise be the source ruleset's), its row, its links and what its
   * form writes beside it. What its plan answers once written (`describe`: the row, with its links as stored).
   */
  async createOwned<P extends OwnedPlan<EntityCreatePlan & { owner: PlannedEntity }>>(
    session: Session,
    rulesetId: string,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);

      const owner = await new EntityEdit(ruleset, rulesetData.cow).cowToEdit(tx, this.type, planned.owner);
      const [row] = await Entities.create<Row>(tx, type, { ...planned.row, ownerId: owner.id });
      await EntityWriter.setParts(tx, scope, { entityId: row.id, entityType: type }, planned, false);

      await EntityWriter.recordActivity(tx, session, "create", type, row.id, planned.activity);
      return planned.describe(row, await EntityLinks.findOwn(tx, row.id));
    });
  }

  /**
   * An entity's delete (`entityId`), as its rules plan it (`plan`, given the transaction to read what the plan needs):
   * refused while it's in use (`EntityUses.refusesDelete`), the row the view's entity resolves to deleted, and what the
   * plan writes with it (the entities it removes). Answers the deleted row.
   */
  async delete<P extends EntityDeletePlan<PlannedEntity>>(
    session: Session,
    rulesetId: string,
    entityId: string,
    plan: (scope: RulesetScope, reads: { tx: Db }) => P | Promise<P>,
  ): Promise<Row> {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      this.open(scope);
      const inUse = await new EntityUses(ruleset, rulesetData.cow).refusesDelete(tx, this.type, entityId);
      policy.canDeleteEntity({ inUse });

      const planned = await plan(scope, { tx });
      const { gone } = EntityWriter.notFoundOf(this.type);
      const targetId = await new EntityEdit(ruleset, rulesetData.cow).cowToDelete(tx, this.type, planned.entity, gone);
      const written = { entityId: targetId, entityType: this.type };
      if (planned.writes) await EntityWriter.writeBeside(tx, scope, written, planned.writes);

      // The database deletes its links and customizations with it.
      const [row] = await Entities.delete<Row>(tx, { entityType: this.type, id: targetId });
      await EntityWriter.recordActivity(tx, session, "delete", this.type, targetId, {
        rulesetId,
        entityName: planned.entity.name,
      });
      return row;
    });
  }

  /**
   * An owned entity's delete (`ownedId`), as its owner's rules plan it (`plan`): refused while it's in use
   * (`EntityUses.refusesDelete`, by the owned kind its owner's declares, `ownedType`, before the access and the plan),
   * its owner copied when it's inherited (the delete would otherwise remove the source ruleset's row), what its plan
   * writes with it, and its row deleted, with its links and customizations. Answers the deleted row.
   */
  async deleteOwned<P extends OwnedPlan<EntityDeletePlan<{ id: string }>>>(
    session: Session,
    rulesetId: string,
    ownedId: string,
    reads: { ownedType: (scope: RulesetScope) => string | undefined; plan: (scope: RulesetScope) => OwnedPlanned<P> },
  ): Promise<Row> {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      const ownedType = reads.ownedType(scope);
      const uses = new EntityUses(ruleset, rulesetData.cow);
      const inUse = ownedType ? await uses.refusesDelete(tx, ownedType as ReferencedType, ownedId) : false;
      policy.canDeleteEntity({ inUse });
      const { plan: planned, type } = reads.plan(scope);

      const notFound = EntityWriter.notFoundOf(type);
      const edit = new EntityEdit(ruleset, rulesetData.cow);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      const written = { entityId: target.id, entityType: type };
      if (planned.writes) await EntityWriter.writeBeside(tx, scope, written, planned.writes);

      // The database deletes its links and its customizations with it
      const [row] = await Entities.delete<Row>(tx, { entityType: type, id: target.id });
      await EntityWriter.recordActivity(tx, session, "delete", type, row.id, planned.activity);
      return row;
    });
  }

  /**
   * An entity's update, as its rules plan it (`plan`, given the transaction to read what the plan needs) from its form
   * (`body`): a new name kept free in its view, as a create's is, the row the view's entity resolves to (the ruleset's
   * own, or its copy, made on its first edit) updated (`updateRow`), its list links replaced, and what the plan writes
   * beside it. What its plan answers once written (`describe`).
   */
  async update<P extends EntityEditPlan<PlannedEntity>>(
    session: Session,
    rulesetId: string,
    body: { name: string; updatedAt?: string },
    plan: (scope: RulesetScope, reads: { tx: Db }) => P | Promise<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      this.open(scope);
      policy.canUpdateEntity();

      const planned = await plan(scope, { tx });
      await new EntityNames(ruleset, rulesetData.cow).assertRenameAvailable(tx, this.type, planned.entity, body.name);
      const target = await new EntityEdit(ruleset, rulesetData.cow).cowToEdit(tx, this.type, planned.entity);
      const row = await EntityWriter.updateRow(tx, this.type, planned.row, target, body.updatedAt);
      await EntityWriter.setParts(tx, scope, { entityId: target.id, entityType: this.type }, planned, true);

      await EntityWriter.recordActivity(tx, session, "update", this.type, target.id, {
        entityName: body.name,
        // What its plan writes another value of, as its rules label it
        changedFields: planned.changes,
      });
      return planned.describe(row, await EntityLinks.findOwn(tx, target.id));
    });
  }

  /**
   * An owned entity's edit, as its owner's rules plan it (`plan`) off its form: its owner copied when it's inherited,
   * the row the entity resolves to updated (`updateRow`, by the client's token, `updatedAt`), its links and what its
   * form writes beside it, its activity recording what it changes (`changedFields`). What its plan answers once written
   * (`describe`).
   */
  async updateOwned<P extends OwnedPlan<EntityEditPlan<{ id: string }>>>(
    session: Session,
    rulesetId: string,
    updatedAt: string | undefined,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);

      const notFound = EntityWriter.notFoundOf(type);
      const edit = new EntityEdit(ruleset, rulesetData.cow);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      const row = await EntityWriter.updateRow(tx, type, planned.row, target, updatedAt);
      await EntityWriter.setParts(tx, scope, { entityId: target.id, entityType: type }, planned, true);

      await EntityWriter.recordActivity(tx, session, "update", type, target.id, {
        ...planned.activity,
        changedFields: planned.changes,
      });
      return planned.describe(row, await EntityLinks.findOwn(tx, target.id));
    });
  }
}
