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
  type EntityRename,
  type EntityRevival,
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
  EntityRevert,
  EntityUses,
  type LockedRulesetScope,
  RulesetChanges,
  type RulesetScope,
} from "@/server/cow/index.ts";
import { withUniqueRefusal } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Entities,
  EntityLinks,
  Modifiers,
  NameBindings,
  type ReferencedType,
  Requirements,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";
import { createContentActivityWithNotifications } from "@/server/services/activities/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
import { getActivityName } from "@/shared/activity.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

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

/**
 * What a plan's writes freed so far of the names its later renames may take: the entities it renamed or removed, by
 * their ids, the names its renames left, and whether it removed any (whose names it doesn't keep).
 */
interface Vacated {
  ids: Set<string>;
  names: Set<string>;
  removed: boolean;
}

/** An entity a write names: its id, of its type. */
interface WrittenEntity {
  entityId: string;
  entityType: string;
}

/** An owned entity's create, as its owner's rules plan it: what refuses it when its owner holds one at its place. */
type OwnedCreate = EntityCreatePlan & { taken: string };

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

/** An entity's type, as a plan names it: refused when it isn't one of its ruleset's base rules' kinds (`baseRules`). */
function entityTypeOf(baseRules: BaseRules, type: string): RulesetEntityType {
  const entityType = Engine.forRules(baseRules)
    .storage()
    .standaloneKinds()
    .find((known) => known === type);
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
 * `createOwned`, `createOwnedMany`, `updateOwned` and `deleteOwned`), each in its transaction and its ruleset's scope.
 * A save checks access, keeps a name free (a create's, taking over a deleted copy's tombstone, and a rename's), and
 * writes the row copy-on-write resolves (`EntityEdit`: the ruleset's own, or the copy of an inherited one, made on its
 * first edit; an owned entity's on its owner's), under the ruleset's lock (`withRulesetWrite`): refused as not found
 * when its fresh view doesn't show it, and as stale when the client's token is behind (a copy's never is). Then its
 * links (`setLinks`), then what its plan writes beside it (`updateBeside`: the entities it removes, then those it
 * makes). A delete is refused while the entity is in use (`EntityUses`). Each first opens the kind's rules for its
 * action (`open`), records its activity (its verb and the written kind's name), and the ruleset's views drop what it
 * changed; but several entities' edits at once (`updateEntities`: a class's spell list's spells), which write in the
 * caller's transaction, its checks and its one activity the caller's.
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
   * What an entity holds past its name and description, as stored, in one text two entities compare by: its fields,
   * its links (by the entities they stand for), its modifiers and its requirements, and its modifiers' own. A copy
   * holds its source's, word for word, until its author changes one.
   */
  private static async findContent(
    tx: Db,
    { rulesetData: { cow } }: LockedRulesetScope,
    entity: { fields: Record<string, unknown>; id: string },
  ) {
    const modifiers = await Modifiers.findMany(tx, { sourceIds: [entity.id] });
    const requirements = await Requirements.findMany(tx, {
      entityIds: [entity.id, ...modifiers.map((modifier) => modifier.id)],
    });
    const links = await EntityLinks.findOwn(tx, entity.id);
    const signOf = new Map(modifiers.map((m) => [m.id, [m.target, m.operator, m.value, m.valueType].join("|")]));
    const fields = Object.entries(entity.fields).toSorted(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({
      fields,
      // A link by the entity it stands for: a copy's may name the ruleset's copy of a pool its source names itself
      links: links
        .map(({ role, tier, toId, viaId }) =>
          [role, cow.originalOf(toId), viaId ? cow.originalOf(viaId) : null, tier ?? null].join("|"),
        )
        .toSorted(),
      modifiers: [...signOf.values()].toSorted(),
      requirements: requirements
        .map((r) =>
          [signOf.get(r.entityId) ?? "", r.level, r.chainingOperator, r.target, r.operator, r.value].join("|"),
        )
        .toSorted(),
    });
  }

  /**
   * An entity a plan makes, in the scope's ruleset: its row (its fields and single links among it), taking over the
   * tombstone of a deleted copy of an ancestor of its name as a create does (unless it stands for none,
   * `standalone`), its links, its modifiers and its requirements.
   */
  private static async makeEntity(tx: Db, scope: LockedRulesetScope, made: MadeEntity) {
    const type = entityTypeOf(scope.ruleset.baseRules, made.type);
    const names = new EntityNames(scope);
    const tombstoneAncestorId = made.standalone
      ? null
      : await names.findTombstoneAncestor(tx, type, made.row.name, made.row.partition);
    await names.assertMadeNameAvailable(tx, type, made.row, tombstoneAncestorId);
    const [entity] = await EntityNames.withNameRefusal(made.row.name, () =>
      Entities.create(tx, scope.ruleset.baseRules, type, { ...made.row, rulesetId: scope.ruleset.id }),
    );
    if (tombstoneAncestorId) await names.repointTombstone(tx, tombstoneAncestorId, entity.id);
    const written = { entityId: entity.id, entityType: type };
    await EntityWriter.setLinks(tx, scope.ruleset.baseRules, written, made.links, false);
    await Modifiers.createMany(
      tx,
      made.modifiers.map((modifier) => ({ ...modifier, sourceId: entity.id, sourceType: type })),
    );
    await Requirements.createMany(
      tx,
      made.requirements.map((requirement) => ({ ...written, ...requirement })),
    );
  }

  /**
   * A new entity an owner holds, as its create's plan writes it (`planned`, of `type`), on the owner's row the write
   * targets (`ownerId`: its copy, for an inherited owner): its row, refused as its plan says (`taken`) when the owner
   * holds one at its place, then its links and what its form writes beside it. What its plan answers once written.
   */
  private static async makeOwned(
    tx: Db,
    scope: LockedRulesetScope,
    policy: RulesetsPolicy,
    owned: { ownerId: string; planned: OwnedCreate; type: string },
  ) {
    const { ownerId, planned, type } = owned;
    const [row] = await withUniqueRefusal(
      () => Entities.create<Row>(tx, scope.ruleset.baseRules, type, { ...planned.row, ownerId }),
      (index) => (index === OWNED_POSITION_INDEX ? new ConflictError(planned.taken) : undefined),
    );
    await EntityWriter.setParts(tx, scope, policy, { entityId: row.id, entityType: type }, planned, false);
    return planned.describe(row, await EntityLinks.findOwn(tx, row.id));
  }

  /**
   * An entity a plan renames with another (a skill's generated feat), checked before anything of the plan's renames
   * is written: its new name and description, and the name it leaves; none when it changes nothing. Its description
   * follows its name, unless its author rewrote it. Its new name is kept free in the view as a rename's is, a name
   * another entity of the plan gives up being free for it (`vacated`: the plan's entities by their ids, and the names
   * its renames leave, which it adds its own to). One its entity's restore renames (`restoring`) to the very name of
   * what it copies, a copy its author left as the app made it, is restored instead, and answers none.
   */
  private static async prepareRename(tx: Db, scope: LockedRulesetScope, renamed: EntityRename, vacated: Vacated) {
    const type = entityTypeOf(scope.ruleset.baseRules, renamed.type);
    const stored = await Entities.findOne(tx, { entityType: type, id: scope.rulesetData.cow.resolve(renamed.id) });
    if (!stored) return undefined;
    const { name } = renamed;
    const description = stored.description === renamed.previousDescription ? renamed.description : stored.description;
    // One that changes nothing writes nothing: no copy made of an inherited entity for it
    if (name === stored.name && description === stored.description) return undefined;
    const names = new EntityNames(scope);
    // (unless the same plan freed that name before it: the view read before it still shows it taken)
    const restoring = renamed.restoring && !vacated.removed && !vacated.names.has(name);
    const sourceId = restoring ? scope.rulesetData.cow.sourceOf(stored.id) : undefined;
    const source = sourceId && (await Entities.findOne(tx, { entityType: type, id: sourceId }));
    const untouched =
      source &&
      source.name === name &&
      stored.rulesetId === scope.ruleset.id &&
      stored.description === renamed.previousDescription &&
      (await EntityWriter.findContent(tx, scope, stored)) === (await EntityWriter.findContent(tx, scope, source));
    if (source && untouched) {
      await EntityRevert.revert(tx, type, source.id, scope, names);
      return undefined;
    }
    await names.assertRenameAvailable(
      tx,
      type,
      { id: renamed.id, name: stored.name ?? "", partition: stored.partition },
      name,
      vacated.ids,
    );
    if (stored.name) vacated.names.add(stored.name);
    return { description, from: stored.name, id: renamed.id, name, type };
  }

  /**
   * Records what a save did to an entity of a kind (`type`, by `verb`) in the ruleset it wrote (`ruleset`), with what
   * the activity carries.
   */
  private static async recordActivity(
    tx: Db,
    ruleset: Ruleset,
    session: Session,
    verb: "create" | "delete" | "update",
    type: string,
    targetId: string,
    data: Record<string, unknown>,
  ) {
    await createContentActivityWithNotifications(tx, ruleset, {
      userId: session.userId,
      targetId,
      targetType: type,
      type: `${verb}${getActivityName(type)}`,
      data,
    });
  }

  /**
   * An entity a plan removes, refused while it's in use, as a delete is (`canDeleteEntity`, with `EntityUses.refusesDelete`),
   * in the words its plan gives (`removal.inUse`). Deleting the ruleset's copy of an inherited one leaves a tombstone
   * snapshot: it disappears from the ruleset while its ancestor stays intact. A hard delete: the database deletes its
   * links and customizations with it, and a soft-archive would block an entity of the same name made later.
   */
  private static async removeEntity(tx: Db, scope: LockedRulesetScope, policy: RulesetsPolicy, removal: EntityRemoval) {
    const type = entityTypeOf(scope.ruleset.baseRules, removal.type);
    const inUse = await new EntityUses(scope).refusesDelete(tx, type, removal.id);
    policy.canDeleteEntity({ inUse, refusal: removal.inUse });

    const notFound = EntityWriter.getNotFound(scope.ruleset.baseRules, type);
    const target = await new EntityEdit(scope).cowById(tx, type, removal.id, notFound);
    await Entities.delete(tx, { entityType: type, id: target.id });
  }

  /**
   * The entities a plan renames with another (`renames`: a skill's generated feats, and those that give up a name for
   * them), each the row the view's entity resolves to: the ruleset's own, or its copy, made here. Each keeps its
   * identity: what names it and who picked it follow. All are checked, then copied under the names they have, before
   * any takes its new one: two may take each other's names, the first stepping aside under a name of its own.
   */
  private static async renameEntities(tx: Db, scope: LockedRulesetScope, renames: EntityRename[], vacated: Vacated) {
    const { baseRules } = scope.ruleset;
    const prepared = [];
    for (const renamed of renames) {
      const rename = await EntityWriter.prepareRename(tx, scope, renamed, vacated);
      if (rename) prepared.push(rename);
    }
    const edit = new EntityEdit(scope);
    const targets = [];
    for (const rename of prepared) {
      const notFound = EntityWriter.getNotFound(baseRules, rename.type);
      targets.push({ ...rename, rowId: (await edit.cowById(tx, rename.type, rename.id, notFound)).id });
    }
    const taken = new Set(targets.map((target) => target.name));
    for (const { from, name, rowId, type } of targets) {
      if (from === name || !from || !taken.has(from)) continue;
      await Entities.update(tx, baseRules, type, { name: `~${rowId}` }, { id: rowId });
    }
    for (const { description, name, rowId, type } of targets) {
      await EntityNames.withNameRefusal(name, () =>
        Entities.update(tx, baseRules, type, { description, name }, { id: rowId }),
      );
    }
  }

  /**
   * The inherited entities a plan shows again (a restored skill's feats, deleted with it): those the ruleset deleted,
   * named as the set names its own, whose rules name the restored entity (their bindings': an entity's feat is told
   * by what it gives to, whatever name it had), each restored as its own restore does. One whose name another entity
   * holds stays deleted: a restore takes no name.
   */
  private static async reviveEntities(tx: Db, scope: LockedRulesetScope, revived: EntityRevival) {
    const type = entityTypeOf(scope.ruleset.baseRules, revived.type);
    const original = (id: string) => scope.rulesetData.cow.originalOf(id);
    const ownerId = original(revived.ownerId);
    const { deleted } = await RulesetChanges.read(tx, scope.ruleset);
    const names = new EntityNames(scope);
    for (const candidate of deleted) {
      if (candidate.entityType !== type || !candidate.name.startsWith(revived.prefix)) continue;
      const modifiers = await Modifiers.findMany(tx, { sourceIds: [candidate.sourceEntityId] });
      const bindings = await NameBindings.findMany(tx, {
        modifierIds: modifiers.map((modifier) => modifier.id),
        requirementIds: [],
      });
      // Its own: one whose rules name this entity, and no other of its kind unless it's named after this one (one its
      // author had name two is the one's it's named after, as the engine tells a view's)
      const named = bindings.flatMap((binding) =>
        binding.entityId !== null && binding.entityType === revived.ownerType ? original(binding.entityId) : [],
      );
      const alone = named.every((id) => id === ownerId);
      if (!named.includes(ownerId) || (!alone && candidate.name !== revived.name)) continue;
      try {
        await EntityRevert.revert(tx, type, candidate.sourceEntityId, scope, names);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
    }
  }

  /**
   * Updates the row a write targets (`target`) to the plan's (`row`, of `type`, of `baseRules`): refused as stale when
   * the client's token (`updatedAt`) is behind, a copy's never being checked (its token is its source's).
   */
  private static async updateRow(
    tx: Db,
    baseRules: BaseRules,
    type: string,
    row: Parameters<typeof Entities.update>[3],
    target: EditTarget,
    updatedAt: string | undefined,
  ): Promise<Row> {
    const expectedUpdatedAt = target.expected(updatedAt);
    const rows = await Entities.update<Row>(tx, baseRules, type, row, { id: target.id, expectedUpdatedAt });
    if (rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);
    return rows[0];
  }

  /**
   * What an entity's write (of `type`, in a ruleset of `baseRules`) refuses it with when its view doesn't show it, its
   * kind named in its rules' word as the engine's refusals name it ("Class level not found"): the entity's words, its
   * first copy's included (`EntityEdit`).
   */
  static getNotFound(baseRules: BaseRules, type: string): string {
    return Engine.rules().describeNotFound(baseRules, type);
  }

  /**
   * Writes the links a plan sets on an entity (of `baseRules`), each set in its order, at once: on an entity it had
   * written before (`replacing`: an edit's), each set replaces the entity's links of its role to its kind, and a role
   * it leaves out keeps its links (none given: every one). A new entity holds none to replace.
   */
  static async setLinks(
    tx: Db,
    baseRules: BaseRules,
    entity: WrittenEntity,
    sets: LinkSet[] | undefined,
    replacing: boolean,
  ) {
    if (!sets?.length) return;
    if (replacing) {
      for (const set of sets)
        await EntityLinks.delete(tx, { fromId: entity.entityId, role: set.role, toType: set.toType });
    }
    await EntityLinks.createMany(
      tx,
      baseRules,
      sets.flatMap((set) => linksOf(entity, set)),
    );
  }

  /**
   * Writes what a save of an entity writes past its row, in the one order every save takes: its links (`replacing`
   * those it held, an edit's: `setLinks`), then what its plan writes beside it.
   */
  static async setParts(
    tx: Db,
    scope: LockedRulesetScope,
    policy: RulesetsPolicy,
    entity: WrittenEntity,
    parts: SavedParts,
    replacing: boolean,
  ) {
    await EntityWriter.setLinks(tx, scope.ruleset.baseRules, entity, parts.links, replacing);
    if (parts.writes) await EntityWriter.updateBeside(tx, scope, policy, parts.writes);
  }

  /**
   * Writes what a plan writes beside an entity (`writes`): the entities it removes, those it shows again, those it
   * renames, then those it makes. An entity's write writes its own; a restore, which writes no row of the kind's, writes these alone.
   */
  static async updateBeside(tx: Db, scope: LockedRulesetScope, policy: RulesetsPolicy, writes: EntityWrites) {
    for (const revived of writes.restored ?? []) await EntityWriter.reviveEntities(tx, scope, revived);
    // A rename may take the name another of the plan gives up: one removed, or one renamed (before or after it:
    // two that take each other's names)
    const vacated: Vacated = {
      ids: new Set((writes.renamed ?? []).map((renamed) => renamed.id)),
      names: new Set(),
      removed: (writes.removed ?? []).length > 0,
    };
    for (const removal of writes.removed ?? []) {
      await EntityWriter.removeEntity(tx, scope, policy, removal);
      vacated.ids.add(removal.id);
    }
    await EntityWriter.renameEntities(tx, scope, writes.renamed ?? [], vacated);
    for (const made of writes.made ?? []) await EntityWriter.makeEntity(tx, scope, made);
  }

  /**
   * Writes edits of entities of a kind (`type`) as their rules plan them (`plans`, each of one entity, as the view has
   * it), with no client's token to check, after what their plan writes before them (`before`: the list an add to an
   * owner's own list makes, which their links name), then in their order: each the row the view's entity resolves to
   * (the ruleset's own, or its copy, made on its first edit), its list links replaced, and what its plan writes beside
   * it. Answers what each plan answers once written (`describe`), in their order.
   */
  static async updateEntities(
    tx: Db,
    scope: LockedRulesetScope,
    policy: RulesetsPolicy,
    type: string,
    plans: readonly EntityEditPlan<PlannedEntity>[],
    before?: EntityWrites,
  ) {
    if (before) await EntityWriter.updateBeside(tx, scope, policy, before);
    const entityType = entityTypeOf(scope.ruleset.baseRules, type);
    const edit = new EntityEdit(scope);
    const written = [];
    for (const planned of plans) {
      const target = await edit.cowToEdit(tx, entityType, planned.entity);
      const row = await EntityWriter.updateRow(tx, scope.ruleset.baseRules, entityType, planned.row, target, undefined);
      await EntityWriter.setParts(tx, scope, policy, { entityId: target.id, entityType }, planned, true);
      written.push(planned.describe(row, await EntityLinks.findOwn(tx, target.id)));
    }
    return written;
  }

  /** The entity's customizations, copied onto the new ones (`entities`, of `baseRules`) from `sourceId`'s. */
  private async copyCustomizations(tx: Db, baseRules: BaseRules, entities: Row[], sourceId: string) {
    const copies = new CustomizationCopies(baseRules);
    const customizations = (await copies.read(tx, [sourceId], this.type)).get(sourceId);
    if (!customizations) return;
    await copies.copyToMany(
      tx,
      entities.map((entity) => entity.id),
      this.type,
      customizations,
    );
  }

  /**
   * New entities of the kind in the scope's ruleset, each its row (`rows`), taking over the tombstone of a deleted copy
   * of an ancestor of its name, the customizations its plan copies (`copyCustomizationsFrom`), then what its plan writes
   * past its row (`setParts`) and its activity: every create's steps, in one order. Answers the rows written.
   */
  private async writeNew(
    tx: Db,
    session: Session,
    scope: LockedRulesetScope,
    policy: RulesetsPolicy,
    rows: NewRow[],
    plan: SavedParts & { copyCustomizationsFrom?: string },
  ): Promise<Row[]> {
    const { ruleset } = scope;
    const names = new EntityNames(scope);
    const written: Row[] = [];
    for (const { row, tombstoneAncestorId } of rows) {
      const [entity] = await EntityNames.withNameRefusal(row.name, () =>
        Entities.create<Row>(tx, ruleset.baseRules, this.type, { ...row, rulesetId: ruleset.id }),
      );
      if (tombstoneAncestorId) await names.repointTombstone(tx, tombstoneAncestorId, entity.id);
      written.push(entity);
    }
    // The customizations they copy, before what the plan writes beside them
    if (plan.copyCustomizationsFrom)
      await this.copyCustomizations(tx, ruleset.baseRules, written, plan.copyCustomizationsFrom);
    for (const entity of written) {
      await EntityWriter.setParts(tx, scope, policy, { entityId: entity.id, entityType: this.type }, plan, false);
      await EntityWriter.recordActivity(tx, scope.ruleset, session, "create", this.type, entity.id, {
        entityName: entity.name,
      });
    }
    return written;
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
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      policy.canUpdateEntity();

      const names = new EntityNames(scope);
      const { tombstoneAncestorId } = await names.assertNameAvailable(tx, this.type, name);
      const planned = await plan(scope, { tombstoneAncestorId, tx });

      const [row] = await this.writeNew(
        tx,
        session,
        scope,
        policy,
        [{ row: planned.row, tombstoneAncestorId }],
        planned,
      );
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
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      policy.canUpdateEntity();
      const planned = plan(scope);

      const given = planned.rows.flatMap((row) => row.name ?? []);
      const names = new EntityNames(scope);
      const tombstones = await names.assertNamesAvailable(tx, this.type, given);
      const rows = planned.rows.map((row) => ({ row, tombstoneAncestorId: row.name && tombstones.get(row.name) }));
      // What each row writes beside it: its links and the customizations it copies, whatever else the plan carries
      const { copyCustomizationsFrom, links } = planned;
      return await this.writeNew(tx, session, scope, policy, rows, { copyCustomizationsFrom, links });
    });
  }

  /**
   * A new entity an entity owns, as its owner's rules plan it (`plan`: the plan and the owned entity's type): its owner
   * copied when it's inherited (the new row would otherwise be the source ruleset's), its row, its links and what its
   * form writes beside it. Refused as its plan says (`taken`) when its owner holds one at its place. What its plan
   * answers once written (`describe`: the row, with its links as stored).
   */
  async createOwned<P extends OwnedPlan<OwnedCreate & { owner: PlannedEntity }>>(
    session: Session,
    rulesetId: string,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);
      const owner = await new EntityEdit(scope).cowToEdit(tx, this.type, planned.owner);
      const created = await EntityWriter.makeOwned(tx, scope, policy, { ownerId: owner.id, planned, type });

      await EntityWriter.recordActivity(tx, scope.ruleset, session, "create", type, created.id, planned.activity);
      return created;
    });
  }

  /**
   * New entities an entity owns, several at once (a class's levels 6 to 15), as its owner's rules plan them (`plan`:
   * each one's create, by place, and the owned entities' type): its owner copied once when it's inherited, then each
   * written as `createOwned` writes its own, in one transaction, all or none, and recorded as one activity, on the
   * first. Answers the owner they were made on (`ownerId`: its copy, when the write copied it) and each entity as its
   * plan answers it once written (`created`), in the plan's order.
   */
  async createOwnedMany<P extends OwnedPlan<{ created: OwnedCreate[]; owner: PlannedEntity }>>(
    session: Session,
    rulesetId: string,
    plan: (scope: RulesetScope) => OwnedPlanned<P>,
  ) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);
      const owner = await new EntityEdit(scope).cowToEdit(tx, this.type, planned.owner);
      const created: Awaited<ReturnType<typeof EntityWriter.makeOwned>>[] = [];
      for (const each of planned.created)
        created.push(await EntityWriter.makeOwned(tx, scope, policy, { ownerId: owner.id, planned: each, type }));

      const [first] = created;
      if (first)
        await EntityWriter.recordActivity(tx, scope.ruleset, session, "create", type, first.id, planned.activity);
      return { created, ownerId: owner.id };
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
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      const inUse = await new EntityUses(scope).refusesDelete(tx, this.type, entityId);
      policy.canDeleteEntity({ inUse });

      const planned = await plan(scope, { tx });
      const targetId = (await new EntityEdit(scope).cowToEdit(tx, this.type, planned.entity)).id;
      if (planned.writes) await EntityWriter.updateBeside(tx, scope, policy, planned.writes);

      // The database deletes its links and customizations with it.
      const [row] = await Entities.delete<Row>(tx, { entityType: this.type, id: targetId });
      await EntityWriter.recordActivity(tx, scope.ruleset, session, "delete", this.type, targetId, {
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
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset } = scope;
      const uses = new EntityUses(scope);
      let inUse = false;
      for (const ownedType of Engine.forRules(ruleset.baseRules).storage().ownedKinds(this.type))
        inUse ||= await uses.refusesDelete(tx, ownedType as ReferencedType, ownedId);
      policy.canDeleteEntity({ inUse });
      const { plan: planned, type } = plan(scope);

      const notFound = EntityWriter.getNotFound(ruleset.baseRules, type);
      const edit = new EntityEdit(scope);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      if (planned.writes) await EntityWriter.updateBeside(tx, scope, policy, planned.writes);

      // The database deletes its links and its customizations with it
      const [row] = await Entities.delete<Row>(tx, { entityType: type, id: target.id });
      await EntityWriter.recordActivity(tx, scope.ruleset, session, "delete", type, row.id, planned.activity);
      return row;
    });
  }

  /**
   * An entity's update, as its rules plan it (`plan`, given the transaction to read what the plan needs) from its form
   * (`body`): a new name kept free in its view, as a create's is, the row the view's entity resolves to (the ruleset's
   * own, or its copy, made on its first edit) updated (`updateRow`), its list links replaced, and what the plan writes
   * beside it. What its plan answers once written (`describe`).
   */
  async update<P extends EntityEditPlan<PlannedEntity & { partition: string }>>(
    session: Session,
    rulesetId: string,
    body: { name: string; updatedAt?: string },
    plan: (scope: RulesetScope, reads: { tx: Db }) => P | Promise<P>,
  ) {
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      this.open(scope);
      policy.canUpdateEntity();

      const planned = await plan(scope, { tx });
      await new EntityNames(scope).assertRenameAvailable(tx, this.type, planned.entity, body.name);
      const target = await new EntityEdit(scope).cowToEdit(tx, this.type, planned.entity);
      const row = await EntityNames.withNameRefusal(body.name, () =>
        EntityWriter.updateRow(tx, scope.ruleset.baseRules, this.type, planned.row, target, body.updatedAt),
      );
      await EntityWriter.setParts(tx, scope, policy, { entityId: target.id, entityType: this.type }, planned, true);

      await EntityWriter.recordActivity(tx, scope.ruleset, session, "update", this.type, target.id, {
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
    return await withRulesetWrite(session, rulesetId, async (tx, scope, policy) => {
      const { ruleset } = scope;
      policy.canUpdateEntity();
      const { plan: planned, type } = plan(scope);

      const notFound = EntityWriter.getNotFound(ruleset.baseRules, type);
      const edit = new EntityEdit(scope);
      const target = await edit.cowOwned(tx, type, this.type, planned.entity.id, notFound);
      const row = await EntityWriter.updateRow(tx, ruleset.baseRules, type, planned.row, target, updatedAt);
      await EntityWriter.setParts(tx, scope, policy, { entityId: target.id, entityType: type }, planned, true);

      await EntityWriter.recordActivity(tx, scope.ruleset, session, "update", type, target.id, {
        ...planned.activity,
        changedFields: planned.changes,
      });
      return planned.describe(row, await EntityLinks.findOwn(tx, target.id));
    });
  }
}
