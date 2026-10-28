import type { Db } from "@/drizzle/database.ts";
import {
  Engine,
  type EntityCopiesPlan,
  type EntityCreatePlan,
  type EntityDeletePlan,
  type EntityEditPlan,
  type EntityForm,
  type EntityRecord,
  type EntityRemoval,
  type EntityWrite,
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
  withRulesetScope,
} from "@/server/cow/index.ts";
import { db, withTransaction, withUniqueRefusal } from "@/server/database/index.ts";
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
import type { BaseRules } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

/** A new entity's row, and the ancestor whose deleted copy's tombstone it takes over by its name, if any. */
interface NewRow {
  row: EntityWrite;
  tombstoneAncestorId: string | null | undefined;
}

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

/** The unique index that keeps an owner's entities at their own places (a class's levels at their numbers). */
const OWNED_POSITION_INDEX = "entities_owner_position_unique_idx";

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

/** The names what a plan makes beside its entity takes (`writes.made`: 3.5's generated feats), by their kind. */
function madeNamesOf(writes: EntityWrites | undefined): Map<RulesetEntityType, string[]> {
  const byType = Map.groupBy(writes?.made ?? [], (made) => entityTypeOf(made.type));
  return new Map([...byType].map(([type, made]) => [type, made.map((entity) => entity.row.name)]));
}

/**
 * Refuses what a plan makes beside its entity under a name its view shows (`made`, by kind), by the locked `names`: as
 * a name another save took since the save's view was read (`MadeNameTaken`), which runs the save again.
 */
async function assertMadeAvailable(tx: Db, names: EntityNames, made: Map<RulesetEntityType, string[]>) {
  try {
    for (const [type, typeNames] of made) await names.assertNamesAvailable(tx, type, typeNames);
  } catch (error) {
    if (error instanceof ConflictError) throw new MadeNameTaken(error);
    throw error;
  }
}

/**
 * A name a save's plan makes an entity of beside its own (3.5's generated feat) that the view read under its lock
 * shows: another save took it since the view the plan was made from was read (a restore, a subscribe, a create). Its
 * save runs again, once, from a view read afresh (`EntityWriter.inScope`), whose rules then make none of it; a second
 * one is the refusal it carries (`conflict`).
 */
class MadeNameTaken extends Error {
  constructor(readonly conflict: ConflictError) {
    super(conflict.message);
  }
}

/**
 * Writes a save of an entity as its rules plan it, every kind's and every save's in one order and by one rule: a
 * ruleset entity's create, update and delete (`type`), and those of the entities it owns (its class levels, by
 * `createOwned`, `updateOwned` and `deleteOwned`), each in its transaction and its ruleset's scope. A save checks
 * access, keeps a name free (a create's, taking over a deleted copy's tombstone, and a rename's), and writes the row
 * copy-on-write resolves (`EntityEdit`: the ruleset's own, or the copy of an inherited one, made on its first edit; an
 * owned entity's on its owner's): refused as not found when it's gone since the view was read, and as stale when the
 * client's token is behind (a copy's never is). Then its links (`setLinks`), then what its plan writes beside it
 * (`writeBeside`: the entities it removes, then those it makes). A delete is refused while the entity
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

  /**
   * Runs a save in its transaction and its ruleset's scope, with the session's policy on it, if the session may read it
   * (`withReadableRuleset`), the ruleset's views dropping what it changed. A save whose plan makes an entity of a name
   * another save took since its view was read (`MadeNameTaken`) runs again, once, after its transaction rolled back
   * (its locks and its connection freed), on the ruleset's view read afresh, before its transaction opens: the save
   * that took it drops the cached view only once committed. Taken again, the name is refused.
   */
  private static async inScope<T>(
    session: Session,
    rulesetId: string,
    save: (tx: Db, scope: RulesetScope, policy: RulesetsPolicy) => Promise<T>,
    again = false,
  ): Promise<T> {
    try {
      const result = await withTransaction(
        async (tx) =>
          await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => await save(tx, scope, policy)),
      );
      RulesetViews.invalidate(rulesetId);
      return result;
    } catch (error) {
      if (!(error instanceof MadeNameTaken)) throw error;
      if (again) throw error.conflict;
      // Read afresh before its transaction opens, on a connection of its own: a read inside it would hold its
      // connection while waiting on another, which saves waiting on its lock may all be holding
      RulesetViews.invalidate(rulesetId);
      await withRulesetScope(db, rulesetId, async () => undefined);
      return await EntityWriter.inScope(session, rulesetId, save, true);
    }
  }

  /**
   * An entity a plan makes, in the scope's ruleset: its row (its fields and single links among it), its links, its
   * modifiers and its requirements.
   */
  private static async makeEntity(tx: Db, scope: RulesetScope, made: MadeEntity) {
    const type = entityTypeOf(made.type);
    const [entity] = await EntityNames.withNameRefusal(made.row.name, () =>
      Entities.create(tx, type, { ...made.row, rulesetId: scope.ruleset.id }),
    );
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

    const notFound = EntityWriter.getNotFound(ruleset, type);
    const target = await new EntityEdit(ruleset, rulesetData.cow).cowById(tx, type, removal.id, notFound);
    await Entities.delete(tx, { entityType: type, id: target.id });
  }

  /**
   * Updates the row a write targets (`target`) to the plan's (`row`, of `type`): refused as stale when the client's
   * token (`updatedAt`) is behind, a copy's never being checked (its token is its source's), and as not found (`gone`)
   * when the row was deleted since the view was read.
   */
  private static async updateRow(
    tx: Db,
    type: string,
    row: Parameters<typeof Entities.update>[2],
    target: EditTarget,
    { gone, updatedAt }: { gone: string; updatedAt: string | undefined },
  ): Promise<Row> {
    const expectedUpdatedAt = target.expected(updatedAt);
    const rows = await Entities.update<Row>(tx, type, row, { id: target.id, expectedUpdatedAt });
    if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);
    // A row deleted since the view was read: no token to call it stale by
    if (rows.length === 0) throw new NotFoundError(gone);
    return rows[0];
  }

  /** Writes what a plan writes beside an entity (`writes`): the entities it removes, then those it makes. */
  private static async writeBeside(tx: Db, scope: RulesetScope, writes: EntityWrites) {
    for (const removal of writes.removed ?? []) await EntityWriter.removeEntity(tx, scope, removal);
    for (const made of writes.made ?? []) await EntityWriter.makeEntity(tx, scope, made);
  }

  /**
   * What an entity's write (of `type`, in a ruleset of `baseRules`) refuses it with when it's missing, or deleted since
   * the view was read, its kind named in its rules' word as the engine's refusals name it ("Class level not found"):
   * the entity's words, its first copy's included (`EntityEdit`).
   */
  static getNotFound({ baseRules }: { baseRules: BaseRules }, type: string): NotFoundMessages {
    const message = `${Engine.rules().labelOf(baseRules, type)} not found`;
    return { gone: message, missing: message };
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
    if (parts.writes) await EntityWriter.writeBeside(tx, scope, parts.writes);
  }

  /**
   * An edit's names (`planned`'s, in the ruleset `rulesetId`), checked under their lock: a new name (`name`) kept free,
   * as a create's is, and what its plan makes (`assertMadeAvailable`), its kind's names and those of the kinds it makes
   * locked in one call. An edit that keeps its name and makes nothing locks none.
   */
  private async checkEdit(tx: Db, rulesetId: string, name: string, planned: EntityEditPlan<PlannedEntity>) {
    const renamed = name !== planned.entity.name;
    const made = madeNamesOf(planned.writes);
    if (!renamed && made.size === 0) return;
    const names = await EntityNames.lock(tx, rulesetId, [this.type, ...made.keys()]);
    if (renamed) await names.assertRenameAvailable(tx, this.type, name);
    await assertMadeAvailable(tx, names, made);
  }

  /** The entity's customizations, copied onto the new ones (`entities`) from `sourceId`'s. */
  private async copyCustomizations(tx: Db, entities: Row[], sourceId: string) {
    const customizations = (await CustomizationCopies.read(tx, [sourceId], this.type)).get(sourceId);
    if (!customizations) return;
    await CustomizationCopies.copyToMany(
      tx,
      entities.map((entity) => entity.id),
      this.type,
      customizations,
    );
  }

  /**
   * New entities of the kind in the scope's ruleset, each its row (`rows`), taking over the tombstone of a deleted copy
   * of an ancestor of its name (by `names`, which checked them), the customizations its plan copies
   * (`copyCustomizationsFrom`), then what its plan writes past its row (`setParts`) and its activity: every create's
   * steps, in one order. Answers the rows written.
   */
  private async writeNew(
    tx: Db,
    session: Session,
    scope: RulesetScope,
    names: EntityNames,
    rows: NewRow[],
    plan: SavedParts & { copyCustomizationsFrom?: string },
  ): Promise<Row[]> {
    const { ruleset } = scope;
    const written: Row[] = [];
    for (const { row, tombstoneAncestorId } of rows) {
      const [entity] = await EntityNames.withNameRefusal(row.name, () =>
        Entities.create<Row>(tx, this.type, { ...row, rulesetId: ruleset.id }),
      );
      if (tombstoneAncestorId) await names.repointTombstone(tx, tombstoneAncestorId, entity.id);
      written.push(entity);
    }
    // The customizations they copy, before what the plan writes beside them
    if (plan.copyCustomizationsFrom) await this.copyCustomizations(tx, written, plan.copyCustomizationsFrom);
    for (const entity of written) {
      await EntityWriter.setParts(tx, scope, { entityId: entity.id, entityType: this.type }, plan, false);
      await EntityWriter.recordActivity(tx, session, "create", this.type, entity.id, { entityName: entity.name });
    }
    return written;
  }

  /**
   * A new entity in the ruleset (`name`, which must be free in its view, as must the names of what it makes beside it),
   * as its rules plan it (`plan`, given the ancestor whose deleted copy's tombstone the new entity takes over, and the
   * transaction to read what the plan needs): what its plan answers once written (`describe`: the row, with its links
   * as stored).
   */
  async create<P extends EntityCreatePlan>(
    session: Session,
    rulesetId: string,
    name: string,
    plan: (scope: RulesetScope, reads: { tombstoneAncestorId: string | null; tx: Db }) => P | Promise<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      policy.canUpdateEntity();

      // Planned first, its kind's names and those of the kinds it makes locked in one call (in the modules' order),
      // then planned again when its name takes over an ancestor's tombstone, which a kind's plan may take after
      const draft = await plan(scope, { tombstoneAncestorId: null, tx });
      const names = await EntityNames.lock(tx, rulesetId, [this.type, ...madeNamesOf(draft.writes).keys()]);
      const { tombstoneAncestorId } = await names.assertNameAvailable(tx, this.type, name);
      const planned = tombstoneAncestorId ? await plan(scope, { tombstoneAncestorId, tx }) : draft;
      await assertMadeAvailable(tx, names, madeNamesOf(planned.writes));

      const rows = [{ row: planned.row, tombstoneAncestorId }];
      const [row] = await this.writeNew(tx, session, scope, names, rows, planned);
      return planned.describe(row, await EntityLinks.findOwn(tx, row.id));
    });
  }

  /**
   * New entities in the ruleset, several rows of one plan (`plan`: an entity's copies, its variants), each written as
   * a create writes its own (`create`): its name kept free in its view (all of them in one read, a name given twice
   * refused), taking over the tombstone of a deleted ancestor of its name, the customizations its plan copies, its
   * links, and its activity. Answers the rows written, in the plan's order.
   */
  async createMany<P extends EntityCopiesPlan>(
    session: Session,
    rulesetId: string,
    plan: (scope: RulesetScope) => P,
  ): Promise<Row[]> {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      policy.canUpdateEntity();
      const planned = plan(scope);

      const given = planned.rows.flatMap((row) => row.name ?? []);
      if (new Set(given).size !== given.length) throw new ConflictError("A name is given twice in the list");
      const names = await EntityNames.lock(tx, rulesetId, [this.type]);
      const tombstones = await names.assertNamesAvailable(tx, this.type, given);
      const rows = planned.rows.map((row) => ({ row, tombstoneAncestorId: row.name && tombstones.get(row.name) }));
      // What each row writes beside it: its links and the customizations it copies, whatever else the plan carries
      const { copyCustomizationsFrom, links } = planned;
      return await this.writeNew(tx, session, scope, names, rows, { copyCustomizationsFrom, links });
    });
  }

  /**
   * A new entity an entity owns, as its owner's rules plan it (`plan`: the plan and the owned entity's type): its owner
   * copied when it's inherited (the new row would otherwise be the source ruleset's), its row, its links and what its
   * form writes beside it. Refused as its plan says (`taken`) when another save gave its owner one at its place since
   * the view was read. What its plan answers once written (`describe`: the row, with its links as stored).
   */
  async createOwned<P extends OwnedPlan<EntityCreatePlan & { owner: PlannedEntity; taken: string }>>(
    session: Session,
    rulesetId: string,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ) {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);

      const { gone } = EntityWriter.getNotFound(ruleset, this.type);
      const owner = await new EntityEdit(ruleset, rulesetData.cow).cowToEdit(tx, this.type, planned.owner, gone);
      const [row] = await withUniqueRefusal(
        () => Entities.create<Row>(tx, type, { ...planned.row, ownerId: owner.id }),
        (index) => (index === OWNED_POSITION_INDEX ? new ConflictError(planned.taken) : undefined),
      );
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
      const { gone } = EntityWriter.getNotFound(ruleset, this.type);
      const targetId = await new EntityEdit(ruleset, rulesetData.cow).cowToDelete(tx, this.type, planned.entity, gone);
      if (planned.writes) await EntityWriter.writeBeside(tx, scope, planned.writes);

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
   * (`EntityUses.refusesDelete`, by the kinds its owner's kind owns, as its storage declares them,
   * `StorageEngine.ownedKinds`, before the access and the plan),
   * its owner copied when it's inherited (the delete would otherwise remove the source ruleset's row), what its plan
   * writes with it, and its row deleted, with its links and customizations. Answers the deleted row.
   */
  async deleteOwned<P extends OwnedPlan<EntityDeletePlan<{ id: string }>>>(
    session: Session,
    rulesetId: string,
    ownedId: string,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ): Promise<Row> {
    return await EntityWriter.inScope(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset, rulesetData } = scope;
      const uses = new EntityUses(ruleset, rulesetData.cow);
      let inUse = false;
      for (const ownedType of Engine.storage().ownedKinds(this.type))
        inUse ||= await uses.refusesDelete(tx, ownedType as ReferencedType, ownedId);
      policy.canDeleteEntity({ inUse });
      const { plan: planned, type } = plan(scope);

      const notFound = EntityWriter.getNotFound(ruleset, type);
      const edit = new EntityEdit(ruleset, rulesetData.cow);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      if (planned.writes) await EntityWriter.writeBeside(tx, scope, planned.writes);

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
      await this.checkEdit(tx, rulesetId, body.name, planned);
      const { gone } = EntityWriter.getNotFound(ruleset, this.type);
      const target = await new EntityEdit(ruleset, rulesetData.cow).cowToEdit(tx, this.type, planned.entity, gone);
      const row = await EntityNames.withNameRefusal(body.name, () =>
        EntityWriter.updateRow(tx, this.type, planned.row, target, { gone, updatedAt: body.updatedAt }),
      );
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

      const notFound = EntityWriter.getNotFound(ruleset, type);
      const edit = new EntityEdit(ruleset, rulesetData.cow);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      const row = await EntityWriter.updateRow(tx, type, planned.row, target, { gone: notFound.gone, updatedAt });
      await EntityWriter.setParts(tx, scope, { entityId: target.id, entityType: type }, planned, true);

      await EntityWriter.recordActivity(tx, session, "update", type, target.id, {
        ...planned.activity,
        changedFields: planned.changes,
      });
      return planned.describe(row, await EntityLinks.findOwn(tx, target.id));
    });
  }
}
