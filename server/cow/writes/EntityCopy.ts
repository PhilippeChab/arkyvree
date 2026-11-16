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
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import {
  Entities,
  EntityLinks,
  EntitySnapshots,
  type NewLink,
  RulesetEntities,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import CustomizationCopies from "./CustomizationCopies.ts";
import EntityNames from "./EntityNames.ts";

/** What a copy's link names for an entity a link names as stored (its id): what `EntityCopy.readNamed` answers. */
type Named = (id: string) => string;

/**
 * A copy: the copied entity, and, when this call made it, each customization it copied, by its source's id (equal
 * values don't make the same row: a modifier's requirements may differ). A copy the ruleset already had (another
 * write's, made since the client read the entity) has none: its rows may have changed since.
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
  private constructor(ruleset: RulesetSources, entityType: RulesetEntityType, entityId: string) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.ruleset = ruleset;
    this.customizationCopies = new CustomizationCopies(ruleset.baseRules);
  }

  /**
   * Links as a copy of their entity holds them (`links`, as stored, from an entity of a kind, `type`): from the copy
   * (`fromId`), the entities they name as the copy names them (`named`), their other parts kept; new links, no id of
   * their own.
   */
  private static copiesOf(links: ViewLink[], fromId: (link: ViewLink) => string, type: string, named: Named) {
    return links.map((link): NewLink => {
      const { amount, free, role, tier, toId, toType, viaId } = link;
      const via = viaId === null ? null : named(viaId);
      return { fromId: fromId(link), fromType: type, role, toId: named(toId), toType, viaId: via, tier, amount, free };
    });
  }

  /** An entity's single links (`links`, as stored), each naming what the copy names for it (`named`). */
  private static namedLinks(links: Readonly<Partial<Record<string, string>>>, named: Named): Record<string, string> {
    return Object.fromEntries(
      Object.entries(links).flatMap(([role, toId]) => (toId === undefined ? [] : [[role, named(toId)]])),
    );
  }

  /**
   * An entity's content in one text (`readContent`): its fields, its links by the entities they stand for (`cow`), its
   * modifiers and its requirements, its modifiers' among them, each by its modifier.
   */
  private static signatureOf(
    cow: CowData,
    fields: Record<string, unknown>,
    links: Pick<ViewLink, "role" | "tier" | "toId" | "viaId">[],
    modifiers: Pick<EntityCustomizations["modifiers"][number], "id" | "operator" | "target" | "value" | "valueType">[],
    requirements: EntityCustomizations["requirements"],
  ) {
    const original = (id: string) => cow.originalOf(cow.resolve(id));
    const signOf = new Map(modifiers.map((m) => [m.id, [m.target, m.operator, m.value, m.valueType].join("|")]));
    return JSON.stringify({
      fields: Object.entries(fields).toSorted(([a], [b]) => a.localeCompare(b)),
      links: links
        .map(({ role, tier, toId, viaId }) =>
          [role, original(toId), viaId ? original(viaId) : null, tier ?? null].join("|"),
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
   * What a copy's links name for the ids they name as stored (`ids`): the entity each resolves to (`cow`: its copy, its
   * winner), as the view shows it, but the stored id itself where that one is gone, a copy the ruleset or its source
   * chain deleted since (a tombstone's). The view shows no link to it (`RulesetData.nameLinks`) and a level-up grants
   * through a pool gone so (a feature's pool deleted), whichever id the link holds, but a link can't hold a gone
   * entity's: it holds its source's, which resolves to the same, and names it again once it's restored. An id that
   * resolves to itself is stored, so it's there; a link names an entity no other owns, which
   * `RulesetEntities.findNames` reads.
   */
  private static async readNamed(tx: Db, cow: CowData, ids: Iterable<string | undefined>): Promise<Named> {
    const resolved = new Set<string>();
    for (const id of ids) if (id !== undefined && cow.resolve(id) !== id) resolved.add(cow.resolve(id));
    const live = new Set((await RulesetEntities.findNames(tx, { ids: [...resolved] })).map((entity) => entity.id));
    return (id) => {
      const resolvedId = cow.resolve(id);
      return resolvedId === id || live.has(resolvedId) ? resolvedId : id;
    };
  }

  /** What a copy's links name for the targets and pools of `links`, as stored (`readNamed`). */
  private static async readNamedLinks(tx: Db, cow: CowData, links: ViewLink[]): Promise<Named> {
    return await EntityCopy.readNamed(
      tx,
      cow,
      links.flatMap((link) => (link.viaId === null ? [link.toId] : [link.toId, link.viaId])),
    );
  }

  /**
   * Copies `entityId` into the ruleset a write holds (`scope`, under its lock: no other write of it, nor of its source
   * chain, where the source is, runs meanwhile), or returns the copy it already has (then with no copied ids): the
   * newly created child entity, and the customizations copied with it, by their sources' ids.
   */
  static async create(
    tx: Db,
    entityType: RulesetEntityType,
    entityId: string,
    scope: LockedRulesetScope,
  ): Promise<CopiedEntity> {
    const copy = new EntityCopy(scope.sources, entityType, entityId);
    const { entity, made } = await copy.copy(tx);
    return made ? { entity, copiedIds: copy.copiedIds } : { entity };
  }

  /**
   * What a copy of copies of one entity (`ids`, of `entityType`: the winner, then its siblings in the order the scope's
   * `CowData` pairs them; an entity alone) holds, as `create` writes it, its siblings merged in as the view merges
   * them: its name and its description, and the rest in one text two entities compare by (`content`): its fields, its
   * links (each by the entity it stands for: a copy's may name the ruleset's copy of a pool its source names itself), its
   * modifiers and its requirements, and its modifiers' own. A copy holds that, word for word, until its author changes
   * one: a restore that changes nothing of it removes it. None when the winner is gone.
   */
  static async readContent(tx: Db, scope: LockedRulesetScope, entityType: RulesetEntityType, ids: string[]) {
    const [winnerId, ...siblingIds] = ids;
    const entity = await Entities.findOne(tx, { entityType, id: winnerId });
    if (!entity) return undefined;
    const cow = scope.rulesetData.cow;
    const copy = new EntityCopy(scope.sources, entityType, winnerId);
    const values = await copy.mergeValues(tx, entity, siblingIds, cow);
    const customizations = await copy.customizationCopies.read(tx, ids, entityType);
    const own = customizations.get(winnerId)!;
    const taken = Engine.forRules(scope.ruleset.baseRules)
      .copyOnWrite()
      .mergeCustomizations(
        own,
        siblingIds.flatMap((id) => customizations.get(id) ?? []),
        winnerId,
      );
    const modifiers = [...own.modifiers, ...taken.modifiers];
    // Its own and its modifiers', each by its modifier (`signatureOf`)
    const requirements = [own, taken].flatMap((held) => [...held.requirements, ...held.modifierRequirements]);
    const links = [
      ...(await EntityLinks.findMany(tx, { fromIds: [winnerId] })),
      ...(await copy.readTakenLinks(tx, winnerId, siblingIds, cow)),
    ].map(({ role, tier, toId, viaId }) => ({ role, tier, toId, viaId }));
    for (const [role, toId] of Object.entries(values.links))
      if (toId !== undefined) links.push({ role, tier: null, toId, viaId: null });
    const { description, name } = { ...entity, ...cow.mergeTexts(ids) };
    return { content: EntityCopy.signatureOf(cow, values.fields, links, modifiers, requirements), description, name };
  }

  private readonly copiedIds = new Map<string, string>();

  /** What reads and copies customizations in its ruleset's base rules. */
  private readonly customizationCopies: CustomizationCopies;

  private readonly entityId: string;

  private readonly entityType: RulesetEntityType;

  /** The ruleset the copy is made in, and where its inherited entities come from. */
  private readonly ruleset: RulesetSources;

  /**
   * Copies the entity into the target ruleset, or returns the copy it already has: the child entity, and whether this
   * call made it (`made`).
   */
  private async copy(tx: Db): Promise<{ entity: EntityRecord; made: boolean }> {
    const entityType = this.entityType;
    const { id: childRulesetId } = this.ruleset;

    // 0. Idempotency: if a COW copy already exists, return it.
    // If the snapshot is a tombstone (the COW row was hard-deleted by a
    // user-initiated delete on an overridden entity), drop the snapshot so
    // we can re-COW below with a fresh forkedEntityId.
    const existingSnapshot = await EntitySnapshots.findOne(tx, {
      sourceEntityId: this.entityId,
      rulesetId: childRulesetId,
    });
    if (existingSnapshot) {
      const existing = await Entities.findOne(tx, { entityType, id: existingSnapshot.forkedEntityId });
      if (existing) return { entity: existing, made: false };
      await EntitySnapshots.delete(tx, {
        sourceEntityId: this.entityId,
        rulesetId: childRulesetId,
      });
    }

    // 1. Fetch the parent entity
    const parentEntity = await Entities.findOne(tx, { entityType, id: this.entityId });
    if (!parentEntity) throw new Error(`Parent entity not found: ${this.entityType}/${this.entityId}`);

    // The ruleset's copy-on-write data, as the transaction sees it, its own copies included: what the copy's references
    // (its row's, its links' and its owned entities') are remapped by
    const cow = await CowDataReader.read(tx, this.ruleset);
    // Its sibling printings, as the view merges them: never one another copy already stands for, whose rows the view
    // leaves out (a book's feat renamed in place, another feat of the book taking its old name)
    const siblingIds = cow.getSiblings(this.entityId).filter((id) => !cow.isOverridden(id));

    // 2. Copy the entity, its fields and its single links (its sibling copies' merged in, as the view merges them, its
    // name and description among them) to the child ruleset, each link to the entity the ruleset shows in its target's
    // place (a race's parent, an item's template, a spell's save), or its stored target where that one is gone
    // (`readNamed`)
    const {
      description,
      fields,
      links: stored,
      name,
      partition,
    } = {
      ...parentEntity,
      ...(await this.mergeValues(tx, parentEntity, siblingIds, cow)),
      ...cow.mergeTexts([this.entityId, ...siblingIds]),
    };
    const links = EntityCopy.namedLinks(stored, await EntityCopy.readNamed(tx, cow, Object.values(stored)));
    // Its rows as they're stored, its source's: a copy keeps them as they are
    // (refused as a taken name is where the ruleset's own entity already has it: two of a name in its view)
    const [newEntity] = await EntityNames.withNameRefusal(name!, () =>
      Entities.create(
        tx,
        this.ruleset.baseRules,
        entityType,
        { rulesetId: childRulesetId, name: name!, description, partition, fields, links },
        true,
      ),
    );

    // 3. Copy customizations
    const customizations = await this.customizationCopies.read(tx, [this.entityId], this.entityType);
    const cust = customizations.get(this.entityId)!;
    await this.customizationCopies.copy(tx, newEntity.id, this.entityType, cust, this.copiedIds);

    // 4. Copy its links of the roles it holds many of and the entities it owns, remapped as the row was
    await this.copyLinksAndOwned(tx, newEntity.id, cow);

    // 4b. Merge sibling data when multiple extensions COW the same base entity
    if (siblingIds.length > 0) await this.mergeSiblings(tx, newEntity.id, cust, siblingIds, cow);

    // 5. Record the copy: the ruleset's view shows it in place of the parent
    await EntitySnapshots.create(tx, {
      rulesetId: childRulesetId,
      sourceEntityId: this.entityId,
      forkedEntityId: newEntity.id,
    });

    return { entity: newEntity, made: true };
  }

  /**
   * Copies the links of the roles they hold many of from entities of a kind (`ids`: each one's copy, by its id) onto
   * their copies, in their order, each naming what the copy names for its targets (`readNamed`).
   */
  private async copyLinks(tx: Db, type: string, ids: ReadonlyMap<string, string>, cow: CowData) {
    const links = await EntityLinks.findMany(tx, { fromIds: [...ids.keys()] });
    const named = await EntityCopy.readNamedLinks(tx, cow, links);
    await EntityLinks.createMany(
      tx,
      this.ruleset.baseRules,
      EntityCopy.copiesOf(links, (link) => ids.get(link.fromId)!, type, named),
    );
  }

  /**
   * Copies the entity's links of the roles it holds many of (a feat's pools, a class's skills) onto the copy, then the
   * entities it owns (a class's levels), with their customizations and their links (a level's grants and saves). Each
   * names what the copy's CowData resolves it to (true overrides and sibling-loser aliases): a copy's references point
   * at the canonical winner, never at a stale loser; one whose stand-in the ruleset or its book deleted since (a
   * granted feat) keeps its stored target, which the view resolves to the same (`readNamed`).
   */
  private async copyLinksAndOwned(tx: Db, targetEntityId: string, cow: CowData) {
    await this.copyLinks(tx, this.entityType, new Map([[this.entityId, targetEntityId]]), cow);
    for (const type of Engine.forRules(this.ruleset.baseRules).storage().ownedKinds(this.entityType)) {
      const owned = await Entities.findMany(tx, { entityType: type, ownerIds: [this.entityId] });
      if (owned.length === 0) continue;
      const named = await EntityCopy.readNamed(
        tx,
        cow,
        owned.flatMap((row) => Object.values(row.links)),
      );
      // Each its position, its fields and its single links (each to what stands for its target: `readNamed`), and
      // its times
      const copies = await Entities.createMany(
        tx,
        this.ruleset.baseRules,
        type,
        owned.map(({ createdAt, fields, links, position, updatedAt }) => ({
          ownerId: targetEntityId,
          position: position!,
          fields,
          links: EntityCopy.namedLinks(links, named),
          createdAt,
          updatedAt,
        })),
        true,
      );
      const ids = new Map(owned.map((row, index) => [row.id, copies[index].id]));
      const customizations = await this.customizationCopies.read(tx, [...ids.keys()], type);
      for (const [id, copyId] of ids) {
        const own = customizations.get(id);
        if (own) await this.customizationCopies.copy(tx, copyId, type, own, this.copiedIds);
      }
      await this.copyLinks(tx, type, ids, cow);
    }
  }

  /**
   * Merges sibling links of the roles that merge (a feat's or a spell's lists:
   * `Engine.forRules(baseRules).copyOnWrite().mergeLinks`), each to the target that stands for it, as the copy's own
   * (`copyLinksAndOwned`): the losers' links, read by their stored ids.
   */
  private async mergeLinks(tx: Db, targetEntityId: string, siblingIds: string[], cow: CowData) {
    const links = await this.readTakenLinks(tx, targetEntityId, siblingIds, cow);
    const named = await EntityCopy.readNamedLinks(tx, cow, links);
    await EntityLinks.createMany(
      tx,
      this.ruleset.baseRules,
      EntityCopy.copiesOf(links, () => targetEntityId, this.entityType, named),
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
    const siblingCusts = await this.customizationCopies.read(tx, siblingIds, this.entityType);
    const siblings = siblingIds.flatMap((id) => siblingCusts.get(id) ?? []);
    const merged = Engine.forRules(this.ruleset.baseRules)
      .copyOnWrite()
      .mergeCustomizations(own, siblings, targetEntityId);
    await this.customizationCopies.copy(tx, targetEntityId, this.entityType, merged, this.copiedIds);
    await this.mergeLinks(tx, targetEntityId, siblingIds, cow);
  }

  /**
   * The entity's fields and single links (`entity`, as stored) with its sibling copies' (`siblingIds`, by their stored
   * ids, in the order its `CowData` pairs them) merged in, as the view merges them
   * (`Engine.forRules(baseRules).copyOnWrite().mergeValues`), each against what it copied (`cow.sourceOf`): its own
   * without any.
   */
  private async mergeValues(tx: Db, entity: EntityRecord, siblingIds: string[], cow: CowData): Promise<StoredValues> {
    if (siblingIds.length === 0) return entity;
    const sourceIds = [entity.id, ...siblingIds].map((id) => cow.sourceOf(id));
    const ids = [...new Set([...siblingIds, ...sourceIds.flatMap((id) => (id === undefined ? [] : [id]))])];
    const records = await Entities.findMany(tx, { entityType: this.entityType, ids });
    const byId = new Map(records.map((record) => [record.id, record]));
    const siblings = siblingIds.map((id) => byId.get(id) ?? { fields: {}, links: {} });
    // A sibling gone since gives none, nor its source
    const [own, ...sources] = sourceIds.map((id, index) =>
      id === undefined || (index > 0 && !byId.has(siblingIds[index - 1])) ? undefined : byId.get(id),
    );
    return Engine.forRules(this.ruleset.baseRules).copyOnWrite().mergeValues(entity, siblings, this.entityType, {
      own,
      siblings: sources,
    });
  }

  /**
   * The links of the roles that merge an entity (`entityId`, as stored) takes of its sibling copies (`siblingIds`, by
   * their stored ids), as the view merges them (`Engine.forRules(baseRules).copyOnWrite().mergeLinks`): those to
   * targets it doesn't link to, each target as `cow` resolves it.
   */
  private async readTakenLinks(tx: Db, entityId: string, siblingIds: string[], cow: CowData) {
    if (siblingIds.length === 0) return [];
    const own = await EntityLinks.findMany(tx, { fromIds: [entityId] });
    const siblingLinks = Map.groupBy(await EntityLinks.findMany(tx, { fromIds: siblingIds }), (link) => link.fromId);
    return Engine.forRules(this.ruleset.baseRules)
      .copyOnWrite()
      .mergeLinks(
        own,
        siblingIds.map((id) => siblingLinks.get(id) ?? []),
        (id) => cow.resolve(id),
        this.entityType,
      );
  }
}
