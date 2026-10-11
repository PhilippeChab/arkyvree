import type { Db } from "@/drizzle/database.ts";
import type { CowData, RulesetSources } from "@/engine/index.ts";
import CowDataReader from "@/server/cow/views/CowDataReader.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import EntityRepositories from "./EntityRepositories.ts";

/** An entity of a name, as stored: its id and its ruleset. */
interface NamedEntity {
  id: string;
  name: string;
  rulesetId: string;
}

/**
 * The names a ruleset's composed view shows (`new EntityNames(ruleset, rulesetData.cow)`), which no change makes it show
 * twice: a new entity, a renamed one, a restored one, a subscribed extension's and one an unsubscribe shows again take a
 * name only when no other entity of their kind the view shows has it, the ruleset's own or an inherited one. An
 * inherited entity the view hides (overridden, or a sibling loser) doesn't block its name, and one whose local copy was
 * deleted left a tombstone snapshot, which a new entity of its name takes over (`repointTombstone`), so the inherited
 * one stays hidden. Every method takes the transaction.
 */
export default class EntityNames {
  constructor(
    private readonly ruleset: RulesetSources,
    private readonly cow: CowData,
  ) {}

  /** Refuses the names an entity of the view has (`named`): the ruleset's own, or a visible inherited entity's. */
  private refuseShown(named: NamedEntity[]) {
    const own = named.find((entity) => entity.rulesetId === this.ruleset.id);
    if (own) throw new ConflictError(`Name already exists in this ruleset: ${own.name}`);

    const shown = named.find((entity) => !this.cow.isHidden(entity.id));
    if (shown) {
      throw new ConflictError(
        `Name already exists in the source chain (an ancestor or subscribed extension): ${shown.name}`,
      );
    }
  }

  /** The entities of a kind named `names`, the ruleset's own and its source chain's (`chain`: its own, unless given). */
  private async findNamed(
    tx: Db,
    entityType: RulesetEntityType,
    names: string[],
    chain = this.cow.sourceChain,
  ): Promise<NamedEntity[]> {
    return await RulesetEntities.findNames(tx, entityType, { names, rulesetIds: [this.ruleset.id, ...chain] });
  }

  /**
   * The hidden ancestors among `ancestors` whose local copy was deleted (a tombstone snapshot), by name: of two of a
   * name, the closer (its ruleset first in the source chain). A live local copy keeps its snapshot even after a rename,
   * so inherited references keep resolving to it.
   */
  private async findTombstones(
    tx: Db,
    entityType: RulesetEntityType,
    ancestors: NamedEntity[],
  ): Promise<Map<string, string>> {
    const repo = EntityRepositories.of(entityType);
    const sourceEntityIds = ancestors.map((ancestor) => ancestor.id);
    const snapshots = await EntitySnapshots.findMany(tx, { sourceEntityIds, rulesetId: this.ruleset.id });
    const tombstoned = new Set<string>();
    for (const snapshot of snapshots) {
      // The local copy, as stored: deleted, it leaves the snapshot a tombstone
      if (!(await repo.exists(tx, { id: snapshot.forkedEntityId }))) tombstoned.add(snapshot.sourceEntityId);
    }

    const chain = this.cow.sourceChain;
    const closestFirst = ancestors.toSorted((a, b) => chain.indexOf(a.rulesetId) - chain.indexOf(b.rulesetId));
    const tombstones = new Map<string, string>();
    for (const { id, name } of closestFirst) if (tombstoned.has(id) && !tombstones.has(name)) tombstones.set(name, id);
    return tombstones;
  }

  /**
   * Refuses a change to the ruleset's extensions when its view (`after`: its `CowData` once they're changed) would then
   * show more entities of a kind under one of `names` (by kind) than once, and than it shows now (`refusal` says so).
   * What the view pairs under one name shows one (a book's copy of an inherited entity, the reprints and the lists the
   * source chain pairs), and a name it already shows twice stays allowed. `leaving`: the ruleset's own entities the
   * change removes (an unsubscribe's copies of the book's entities).
   */
  private async refuseChainNames(
    tx: Db,
    after: CowData,
    names: ReadonlyMap<RulesetEntityType, string[]>,
    leaving: ReadonlySet<string>,
    refusal: (entityType: RulesetEntityType, name: string) => string,
  ) {
    const shown = (cow: CowData, id: string) => !cow.isHidden(id);
    const before = new Set([this.ruleset.id, ...this.cow.sourceChain]);
    const remaining = new Set([this.ruleset.id, ...after.sourceChain]);
    const chain = [...new Set([...this.cow.sourceChain, ...after.sourceChain])];
    for (const [entityType, typeNames] of names) {
      const named = await this.findNamed(tx, entityType, typeNames, chain);
      for (const [name, entities] of Map.groupBy(named, (entity) => entity.name)) {
        const shownBefore = entities.filter(({ id, rulesetId }) => before.has(rulesetId) && shown(this.cow, id));
        const shownAfter = entities.filter(
          ({ id, rulesetId }) => remaining.has(rulesetId) && !leaving.has(id) && shown(after, id),
        );
        if (shownAfter.length > Math.max(shownBefore.length, 1)) throw new ConflictError(refusal(entityType, name));
      }
    }
  }

  /**
   * Refuses subscribing the ruleset to new extensions (`extensionIds`) when its view would then show more entities of a
   * kind under a name than once, and than it shows now (`refuseChainNames`, with `CowData` read as the view would read
   * it once subscribed): an extension's entity (its own, or its copy of an inherited one, by its name) named as one the
   * view shows, or as another the extensions bring.
   */
  async assertExtensionNamesAvailable(tx: Db, extensionIds: string[]): Promise<void> {
    const extensionRulesetIds = [...this.ruleset.extensionRulesetIds, ...extensionIds];
    const after = await CowDataReader.read(tx, { ...this.ruleset, extensionRulesetIds });
    const names = new Map<RulesetEntityType, string[]>();
    for (const entityType of RULESET_ENTITY_TYPES) {
      const brought = await RulesetEntities.findNames(tx, entityType, { rulesetIds: extensionIds });
      names.set(entityType, [...new Set(brought.map((entity) => entity.name))]);
    }
    await this.refuseChainNames(
      tx,
      after,
      names,
      new Set(),
      (entityType, name) =>
        `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset or another subscribed extension`,
    );
  }

  /**
   * Refuses a new entity's name, as `assertNamesAvailable` does. Returns the closest hidden ancestor of its name whose
   * local copy was deleted (a tombstone), which the caller passes to `repointTombstone` once the entity is created, so
   * the snapshot follows the new entity.
   */
  async assertNameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    name: string,
  ): Promise<{ tombstoneAncestorId: string | null }> {
    const tombstones = await this.assertNamesAvailable(tx, entityType, [name]);
    return { tombstoneAncestorId: tombstones.get(name) ?? null };
  }

  /**
   * Refuses new entities' names (`names`) the view shows: one the ruleset has, or a visible inherited entity has (the
   * source chain's, an ancestor's or a subscribed extension's), named in the refusal. Returns, by name, the closest
   * hidden ancestor whose local copy was deleted (a tombstone), which a new entity of that name takes over
   * (`repointTombstone`).
   */
  async assertNamesAvailable(tx: Db, entityType: RulesetEntityType, names: string[]): Promise<Map<string, string>> {
    const named = await this.findNamed(tx, entityType, names);
    this.refuseShown(named);
    return await this.findTombstones(tx, entityType, named);
  }

  /**
   * Refuses renaming an entity (`entity`, as the view has it) to a name the view shows, as a create's is: the name it
   * keeps is its own, whoever else has it (an inherited entity's first edit copies it under its name). A renamed entity
   * takes over no tombstone: the copy it may be keeps its own snapshot, and the hidden ancestor of its new name stays
   * hidden.
   */
  async assertRenameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { name: string },
    name: string,
  ): Promise<void> {
    if (name !== entity.name) this.refuseShown(await this.findNamed(tx, entityType, [name]));
  }

  /**
   * Refuses restoring an inherited entity (`sourceEntityId`) in place of the ruleset's copy of it (`copyId`, gone when
   * the copy was deleted: a tombstone) when the view shows another entity of the source's name: a restore renames the
   * view's entity back to its source's name, or shows a deleted one again, as a rename or a create would.
   */
  async assertRestoreAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    sourceEntityId: string,
    copyId: string,
  ): Promise<void> {
    const entities = await RulesetEntities.findNames(tx, entityType, { ids: [sourceEntityId, copyId] });
    const source = entities.find((entity) => entity.id === sourceEntityId);
    const copy = entities.find((entity) => entity.id === copyId);
    if (source && copy?.name !== source.name) this.refuseShown(await this.findNamed(tx, entityType, [source.name]));
  }

  /**
   * Refuses unsubscribing the ruleset from an extension (`extensionId`) when its view would then show more entities of a
   * kind under a name than once, and than it shows now (`refuseChainNames`, with `CowData` read as the view would read
   * it once unsubscribed): what the extension hid shows again under its name (a core entity it copied, its copies'
   * siblings, a reprint it won over), which the ruleset may have given another entity since. The ruleset's copies of
   * the extension's entities (`copyIds`) go with it.
   */
  async assertReturningNamesAvailable(tx: Db, extensionId: string, copyIds: string[]): Promise<void> {
    const extensionRulesetIds = this.ruleset.extensionRulesetIds.filter((id) => id !== extensionId);
    const after = await CowDataReader.read(tx, { ...this.ruleset, extensionRulesetIds });
    const remaining = new Set([this.ruleset.id, ...after.sourceChain]);
    const returning = this.cow.getStaleIds().filter((id) => !after.isHidden(id));
    const names = new Map<RulesetEntityType, string[]>();
    for (const entityType of RULESET_ENTITY_TYPES) {
      const shown = await RulesetEntities.findNames(tx, entityType, { ids: returning });
      const kept = shown.filter((entity) => remaining.has(entity.rulesetId));
      names.set(entityType, [...new Set(kept.map((entity) => entity.name))]);
    }
    await this.refuseChainNames(
      tx,
      after,
      names,
      new Set(copyIds),
      (entityType, name) =>
        `Cannot unsubscribe: ${entityType} "${name}", which this extension replaces, would show again beside another of its name: rename that one first`,
    );
  }

  /**
   * Points the tombstone snapshot a deleted local copy of `ancestorEntityId` left at the new entity of its name, so the
   * inherited entity stays hidden behind it.
   */
  async repointTombstone(
    tx: Db,
    entityType: RulesetEntityType,
    ancestorEntityId: string,
    newEntityId: string,
  ): Promise<void> {
    const tombstone = await EntitySnapshots.findOne(tx, {
      sourceEntityId: ancestorEntityId,
      rulesetId: this.ruleset.id,
    });
    if (!tombstone) return;
    await EntitySnapshots.delete(tx, {
      sourceEntityId: ancestorEntityId,
      rulesetId: this.ruleset.id,
    });
    await EntitySnapshots.create(tx, {
      rulesetId: this.ruleset.id,
      entityType,
      sourceEntityId: ancestorEntityId,
      forkedEntityId: newEntityId,
    });
  }
}
