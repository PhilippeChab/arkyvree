import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type EntityCustomizations, type RulesetSources } from "@/engine/index.ts";
import CowDataReader from "@/server/cow/views/CowDataReader.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CUSTOMIZABLE_TYPES,
  Entities,
  EntitySnapshots,
  Joins,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import CustomizationCopies from "./CustomizationCopies.ts";
import EntityRepositories, { type EntityWithId } from "./EntityRepositories.ts";

/**
 * A copy made: the copied entity, and each customization it copied, by its source's id (equal values don't make the
 * same row: a modifier's requirements may differ).
 */
export interface CopiedEntity {
  copiedIds: ReadonlyMap<string, string>;
  entity: EntityWithId;
}

/**
 * COW trigger: one copy of an inherited entity into a fork (`EntityCopy.create`), with all its customizations and
 * relationships, its sibling copies' data merged in, and the entity_snapshot record. Each copy is its own instance,
 * which records the customizations it copied.
 */
export default class EntityCopy {
  private constructor(entityType: RulesetEntityType, entityId: string, ruleset: RulesetSources) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.ruleset = ruleset;
    this.sourceType = CUSTOMIZABLE_TYPES.includes(entityType) ? entityType : undefined;
  }

  /**
   * Copies `entityId` into `ruleset`, or returns the copy it already has (then with no copied ids): the newly created
   * child entity, and the customizations copied with it.
   */
  static async create(
    tx: Db,
    entityType: RulesetEntityType,
    entityId: string,
    ruleset: RulesetSources,
  ): Promise<CopiedEntity> {
    const copy = new EntityCopy(entityType, entityId, ruleset);
    const entity = await copy.copy(tx);
    return { entity, copiedIds: copy.copiedIds };
  }

  private readonly copiedIds = new Map<string, string>();

  private readonly entityId: string;

  private readonly entityType: RulesetEntityType;

  /** The ruleset the copy is made in, and where its inherited entities come from. */
  private readonly ruleset: RulesetSources;

  private readonly sourceType: string | undefined;

  /** Copies the entity into the target ruleset, or returns the copy it already has: the newly created child entity. */
  private async copy(tx: Db): Promise<EntityWithId> {
    const repo = EntityRepositories.of(this.entityType);
    const { id: childRulesetId } = this.ruleset;

    // A second first edit must wait for the copying transaction, then see its
    // committed snapshot. Keep this separate from the SELECT: under READ
    // COMMITTED, a SELECT started before the wait retains its old snapshot.
    await EntitySnapshots.lock(tx, { rulesetId: childRulesetId, sourceEntityId: this.entityId });

    // 0. Idempotency: if a COW copy already exists, return it.
    // If the snapshot is a tombstone (the COW row was hard-deleted by a
    // user-initiated delete on an overridden entity), drop the snapshot so
    // we can re-COW below with a fresh forkedEntityId.
    const existingSnapshot = await EntitySnapshots.findOne(tx, {
      sourceEntityId: this.entityId,
      rulesetId: childRulesetId,
    });
    if (existingSnapshot) {
      const exists = await repo.lock(tx, { id: existingSnapshot.forkedEntityId });
      const existing = exists ? await repo.findOne(tx, { id: existingSnapshot.forkedEntityId }) : undefined;
      if (existing) return existing;
      await EntitySnapshots.delete(tx, {
        sourceEntityId: this.entityId,
        rulesetId: childRulesetId,
      });
    }

    // 1. Fetch the parent entity
    if (!(await repo.lock(tx, { id: this.entityId }, "share")))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");

    const parentEntity = await repo.findOne(tx, { id: this.entityId });
    if (!parentEntity) throw new Error(`Parent entity not found: ${this.entityType}/${this.entityId}`);

    // The ruleset's copy-on-write data, as the transaction sees it, its own copies included: what the copy's references
    // (its row's, its relationships') are remapped by
    const cow = await CowDataReader.read(tx, this.ruleset);

    // 2. Copy entity to child ruleset, its references to the entities the ruleset shows in their place (a race's
    // parent, an item's template, a spell's save)
    const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, rulesetId: _rid, ...entityData } = parentEntity;
    const [resolvedData] = cow.resolveRows([entityData]);
    const newRows = await repo.create(tx, { ...resolvedData, rulesetId: childRulesetId });
    const newEntity = newRows[0];

    // 3. Copy customizations
    const customizations = await CustomizationCopies.read(tx, [this.entityId], this.entityType, this.sourceType);
    const cust = customizations.get(this.entityId) ?? {
      modifiers: [],
      properties: [],
      requirements: [],
      modifierRequirements: [],
    };
    await CustomizationCopies.copy(tx, newEntity.id, this.entityType, cust, this.copiedIds);

    // 4. Copy relationships (aptitudes, klass levels, etc.), remapped as the row was
    await this.copyRelationships(tx, newEntity.id, cow);

    // 4b. Merge sibling data when multiple extensions COW the same base entity
    const siblingIds = cow.getSiblings(this.entityId);
    if (siblingIds.length > 0) await this.mergeSiblings(tx, newEntity.id, cust, siblingIds, cow);

    // 5. Record the copy: the ruleset's view shows it in place of the parent
    await EntitySnapshots.create(tx, {
      rulesetId: childRulesetId,
      entityType: this.entityType,
      sourceEntityId: this.entityId,
      forkedEntityId: newEntity.id,
    });

    return newEntity;
  }

  /** Copies the join rows from entities of a kind (`ids`: each one's copy, by its id) onto their copies. */
  private async copyJoins(tx: Db, type: string, ids: ReadonlyMap<string, string>, resolve: (id: string) => string) {
    const storage = Engine.storage();
    for (const join of storage.joinNames()) {
      if (storage.join(join).from !== type) continue;
      const from = Object.keys(storage.join(join).columns).find((name) => storage.join(join).columns[name] === "from")!;
      const rows = await Joins.findMany(tx, { join, fromIds: [...ids.keys()] });
      await Joins.createIds(
        tx,
        join,
        rows.map((row) => storage.joinCopyOf(join, row, ids.get(String(row[from]))!, resolve)),
      );
    }
  }

  /**
   * Copies the join rows of every join from the entity's kind (a feat's pools, a class's skills) onto the copy, then
   * the entities it owns (a class's levels), with their customizations and their join rows (a level's grants and
   * saves). Each names what the copy's CowData resolves it to (true overrides and sibling-loser aliases): a copy's
   * references point at the canonical winner, never at a stale loser.
   */
  private async copyRelationships(tx: Db, targetEntityId: string, cow: CowData) {
    const resolve = (id: string) => cow.resolve(id);
    await this.copyJoins(tx, this.entityType, new Map([[this.entityId, targetEntityId]]), resolve);
    const storage = Engine.storage();
    for (const { ownerType, type } of storage.registries().entityTypes) {
      if (ownerType !== this.entityType) continue;
      const owner = Object.keys(storage.kind(type).columns).find(
        (name) => storage.kind(type).columns[name].kind === "owner",
      )!;
      const owned = await Entities.findMany(tx, { entityType: type, ownerIds: [this.entityId] });
      if (owned.length === 0) continue;
      const copies = await Entities.createMany(
        tx,
        type,
        owned.map((row) => ({ ...row, id: undefined, [owner]: targetEntityId })),
      );
      const ids = new Map(owned.map((row, index) => [row.id, copies[index].id]));
      const customizable = CUSTOMIZABLE_TYPES.includes(type) ? type : undefined;
      const customizations = await CustomizationCopies.read(tx, [...ids.keys()], type, customizable);
      for (const [id, copyId] of ids) {
        const own = customizations.get(id);
        if (own) await CustomizationCopies.copy(tx, copyId, type, own, this.copiedIds);
      }
      await this.copyJoins(tx, type, ids, resolve);
    }
  }

  /**
   * Merges sibling list links of a feat or a spell (`copyOnWrite().mergeListLinks`), each to the list that stands for
   * it, as the copy's own (`copyRelationships`): the losers' links, read by their stored ids.
   */
  private async mergeListLinks(tx: Db, targetEntityId: string, siblingIds: string[], cow: CowData) {
    const storage = Engine.storage();
    const list = storage.listRowsOf(this.entityType, targetEntityId, []);
    if (!list) return;
    const resolve = (id: string) => cow.resolve(id);
    const own = storage.listLinksOf(
      this.entityType,
      await Joins.findMany(tx, { join: list.join, fromIds: [targetEntityId] }),
    );
    const siblingLinks = Map.groupBy(
      storage.listLinksOf(this.entityType, await Joins.findMany(tx, { join: list.join, fromIds: siblingIds })),
      (link) => link.fromId,
    );
    const links = Engine.copyOnWrite().mergeListLinks(
      own,
      siblingIds.map((id) => siblingLinks.get(id) ?? []),
      resolve,
    );
    const rows = storage.listRowsOf(
      this.entityType,
      targetEntityId,
      links.map((link) => ({ ...link, listId: resolve(link.listId) })),
    )!.rows;
    await Joins.createIds(tx, list.join, rows);
  }

  /**
   * Merge sibling data into the copy. When multiple extensions COW the same base entity, the "winner" is copied first.
   * This merges what its siblings add, by the rules a ruleset's view merges them by (`siblingMerge.ts`), so the child
   * fork starts from the merged view: their modifiers (each with its requirements), properties and requirements against
   * the winner's (`own`, which the copy holds), then their aptitude links. Each copied row's id is recorded.
   */
  private async mergeSiblings(
    tx: Db,
    targetEntityId: string,
    own: EntityCustomizations,
    siblingIds: string[],
    cow: CowData,
  ) {
    // The losers' own rows, by their stored ids
    const siblingCusts = await CustomizationCopies.read(tx, siblingIds, this.entityType, this.sourceType);
    const siblings = siblingIds.flatMap((id) => siblingCusts.get(id) ?? []);
    const merged = Engine.copyOnWrite().mergeCustomizations(own, siblings, targetEntityId);
    await CustomizationCopies.copy(tx, targetEntityId, this.entityType, merged, this.copiedIds);
    await this.mergeListLinks(tx, targetEntityId, siblingIds, cow);
  }
}
