import type { Db } from "@/drizzle/database.ts";
import {
  type CowData,
  Engine,
  type EntityCustomizations,
  type EntityRecord,
  type RulesetSources,
  type StoredValues,
  type ViewLink,
} from "@/engine/index.ts";
import CowDataReader from "@/server/cow/views/CowDataReader.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Entities,
  EntityLinks,
  EntitySnapshots,
  type NewLink,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import CustomizationCopies from "./CustomizationCopies.ts";

/**
 * A copy: the copied entity, and, when this call made it, each customization it copied, by its source's id (equal
 * values don't make the same row: a modifier's requirements may differ). A copy the ruleset already had (another
 * write's, made since this one's view was read) has none: its rows may have changed since.
 */
export interface CopiedEntity {
  copiedIds?: ReadonlyMap<string, string>;
  entity: EntityRecord;
}

/**
 * COW trigger: one copy of an inherited entity into a fork (`EntityCopy.create`), with all its customizations, its
 * links and the entities it owns, its sibling copies' data merged in, and the entity_snapshot record. Each copy is its
 * own instance, which records the customizations it copied.
 */
export default class EntityCopy {
  private constructor(entityType: RulesetEntityType, entityId: string, ruleset: RulesetSources, gone: string) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.ruleset = ruleset;
    this.gone = gone;
    this.sourceType = Engine.storage().customizableKinds().includes(entityType) ? entityType : undefined;
  }

  /**
   * A link as a copy of its entity holds it (`link`, from an entity of a kind, `type`): from the copy (`fromId`), the
   * entities it names resolved (`resolve`: to what stands for them), its other parts kept; a new link, no id of its own.
   */
  private static copyOf(link: ViewLink, fromId: string, type: string, resolve: (id: string) => string): NewLink {
    const { amount, free, role, tier, toId, toType, viaId } = link;
    return {
      fromId,
      fromType: type,
      role,
      toId: resolve(toId),
      toType,
      viaId: viaId === null ? null : resolve(viaId),
      tier,
      amount,
      free,
    };
  }

  /**
   * Copies `entityId` into `ruleset`, or returns the copy it already has (then with no copied ids): the newly created
   * child entity, and the customizations copied with it, by their sources' ids. Refused as not found, in the write's
   * words (`gone`), when the source was deleted since the write's view was read.
   */
  static async create(
    tx: Db,
    entityType: RulesetEntityType,
    entityId: string,
    ruleset: RulesetSources,
    gone: string,
  ): Promise<CopiedEntity> {
    const copy = new EntityCopy(entityType, entityId, ruleset, gone);
    const { entity, made } = await copy.copy(tx);
    return made ? { entity, copiedIds: copy.copiedIds } : { entity };
  }

  private readonly copiedIds = new Map<string, string>();

  private readonly entityId: string;

  private readonly entityType: RulesetEntityType;

  /** What refuses the copy when its source was deleted since the write's view was read, in the write's words. */
  private readonly gone: string;

  /** The ruleset the copy is made in, and where its inherited entities come from. */
  private readonly ruleset: RulesetSources;

  private readonly sourceType: string | undefined;

  /**
   * Copies the entity into the target ruleset, or returns the copy it already has: the child entity, and whether this
   * call made it (`made`).
   */
  private async copy(tx: Db): Promise<{ entity: EntityRecord; made: boolean }> {
    const entityType = this.entityType;
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
      const exists = await Entities.lock(tx, { id: existingSnapshot.forkedEntityId });
      const existing = exists
        ? await Entities.findOne(tx, { entityType, id: existingSnapshot.forkedEntityId })
        : undefined;
      if (existing) return { entity: existing, made: false };
      await EntitySnapshots.delete(tx, {
        sourceEntityId: this.entityId,
        rulesetId: childRulesetId,
      });
    }

    // 1. Fetch the parent entity
    if (!(await Entities.lock(tx, { id: this.entityId }, "share"))) throw new NotFoundError(this.gone);

    const parentEntity = await Entities.findOne(tx, { entityType, id: this.entityId });
    if (!parentEntity) throw new Error(`Parent entity not found: ${this.entityType}/${this.entityId}`);

    // The ruleset's copy-on-write data, as the transaction sees it, its own copies included: what the copy's references
    // (its row's, its links' and its owned entities') are remapped by
    const cow = await CowDataReader.read(tx, this.ruleset);
    const siblingIds = cow.getSiblings(this.entityId);

    // 2. Copy the entity, its fields and its single links (its sibling copies' merged in, as the view merges them) to
    // the child ruleset, each link to the entity the ruleset shows in its target's place (a race's parent, an item's
    // template, a spell's save)
    const merged = await this.mergeValues(tx, parentEntity, siblingIds);
    const [{ campaignId, description, fields, links, name, partition }] = cow.resolveLinks([
      { ...parentEntity, ...merged },
    ]);
    // Its rows as they're stored, its source's: a copy keeps them as they are
    const [newEntity] = await Entities.create(
      tx,
      entityType,
      { rulesetId: childRulesetId, campaignId, name: name!, description, partition, fields, links },
      true,
    );

    // 3. Copy customizations
    const customizations = await CustomizationCopies.read(tx, [this.entityId], this.entityType, this.sourceType);
    const cust = customizations.get(this.entityId)!;
    await CustomizationCopies.copy(tx, newEntity.id, this.entityType, cust, this.copiedIds);

    // 4. Copy its links of the roles it holds many of and the entities it owns, remapped as the row was
    await this.copyLinksAndOwned(tx, newEntity.id, cow);

    // 4b. Merge sibling data when multiple extensions COW the same base entity
    if (siblingIds.length > 0) await this.mergeSiblings(tx, newEntity.id, cust, siblingIds, cow);

    // 5. Record the copy: the ruleset's view shows it in place of the parent
    await EntitySnapshots.create(tx, {
      rulesetId: childRulesetId,
      entityType: this.entityType,
      sourceEntityId: this.entityId,
      forkedEntityId: newEntity.id,
    });

    return { entity: newEntity, made: true };
  }

  /**
   * Copies the links of the roles they hold many of from entities of a kind (`ids`: each one's copy, by its id) onto
   * their copies, in their order.
   */
  private async copyLinks(tx: Db, type: string, ids: ReadonlyMap<string, string>, resolve: (id: string) => string) {
    const links = await EntityLinks.findMany(tx, { fromIds: [...ids.keys()] });
    await EntityLinks.createMany(
      tx,
      links.map((link) => EntityCopy.copyOf(link, ids.get(link.fromId)!, type, resolve)),
    );
  }

  /**
   * Copies the entity's links of the roles it holds many of (a feat's pools, a class's skills) onto the copy, then the
   * entities it owns (a class's levels), with their customizations and their links (a level's grants and saves). Each
   * names what the copy's CowData resolves it to (true overrides and sibling-loser aliases): a copy's references point
   * at the canonical winner, never at a stale loser.
   */
  private async copyLinksAndOwned(tx: Db, targetEntityId: string, cow: CowData) {
    const resolve = (id: string) => cow.resolve(id);
    await this.copyLinks(tx, this.entityType, new Map([[this.entityId, targetEntityId]]), resolve);
    for (const type of Engine.storage().ownedKinds(this.entityType)) {
      const owned = await Entities.findMany(tx, { entityType: type, ownerIds: [this.entityId] });
      if (owned.length === 0) continue;
      // Each its position, its fields and its single links (each to what stands for its target), and its times
      const copies = await Entities.createMany(
        tx,
        type,
        cow.resolveLinks(owned).map(({ createdAt, fields, links, position, updatedAt }) => ({
          ownerId: targetEntityId,
          position: position!,
          fields,
          links,
          createdAt,
          updatedAt,
        })),
        true,
      );
      const ids = new Map(owned.map((row, index) => [row.id, copies[index].id]));
      const customizable = Engine.storage().customizableKinds().includes(type) ? type : undefined;
      const customizations = await CustomizationCopies.read(tx, [...ids.keys()], type, customizable);
      for (const [id, copyId] of ids) {
        const own = customizations.get(id);
        if (own) await CustomizationCopies.copy(tx, copyId, type, own, this.copiedIds);
      }
      await this.copyLinks(tx, type, ids, resolve);
    }
  }

  /**
   * Merges sibling links of the roles that merge (a feat's or a spell's lists: `copyOnWrite().mergeLinks`), each to the
   * target that stands for it, as the copy's own (`copyLinksAndOwned`): the losers' links, read by their stored ids.
   */
  private async mergeLinks(tx: Db, targetEntityId: string, siblingIds: string[], cow: CowData) {
    const resolve = (id: string) => cow.resolve(id);
    const own = await EntityLinks.findMany(tx, { fromIds: [targetEntityId] });
    const siblingLinks = Map.groupBy(await EntityLinks.findMany(tx, { fromIds: siblingIds }), (link) => link.fromId);
    const links = Engine.copyOnWrite().mergeLinks(
      own,
      siblingIds.map((id) => siblingLinks.get(id) ?? []),
      resolve,
      this.entityType,
    );
    await EntityLinks.createMany(
      tx,
      links.map((link) => EntityCopy.copyOf(link, targetEntityId, this.entityType, resolve)),
    );
  }

  /**
   * Merge sibling data into the copy. When multiple extensions COW the same base entity, the "winner" is copied first,
   * its fields and single links with its siblings' merged in (`mergeValues`). This merges what else its siblings add,
   * by the rules a ruleset's view merges them by (`siblingMerge.ts`), so the child fork starts from the merged view:
   * their modifiers (each with its requirements) and requirements against the winner's (`own`, which the copy holds),
   * then their links of the roles that merge (a feat's pools). Each copied row's id is recorded.
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
    await this.mergeLinks(tx, targetEntityId, siblingIds, cow);
  }

  /**
   * The entity's fields and single links (`entity`, as stored) with its sibling copies' (`siblingIds`, by their stored
   * ids, in the order its `CowData` pairs them) merged in, as the view merges them (`copyOnWrite().mergeValues`): its own
   * without any.
   */
  private async mergeValues(tx: Db, entity: EntityRecord, siblingIds: string[]): Promise<StoredValues> {
    if (siblingIds.length === 0) return entity;
    const records = await Entities.findMany(tx, { entityType: this.entityType, ids: siblingIds });
    const byId = new Map(records.map((record) => [record.id, record]));
    const siblings = siblingIds.map((id) => byId.get(id) ?? { fields: {}, links: {} });
    return Engine.copyOnWrite().mergeValues(entity, siblings, this.entityType);
  }
}
