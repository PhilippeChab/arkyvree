import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type RulesetSources } from "@/engine/index.ts";
import CowDataReader from "@/server/cow/views/CowDataReader.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { withUniqueRefusal } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  Entities,
  EntitySnapshots,
  RulesetEntities,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import type ExtensionDeparture from "./ExtensionDeparture.ts";

/** An entity of a name, as stored: its id, its partition (what a race or a class is for) and its ruleset. */
interface NamedEntity {
  id: string;
  name: string;
  partition: string;
  rulesetId: string;
}

/** A name a book's entity takes, and the entity of the book's view it's taken for, if any (`standsFor`). */
interface TakenName {
  name: string;
  standsFor?: string;
}

/** The unique index that keeps an entity's name its own among its ruleset's entities of its kind (`drizzle/schema.ts`). */
const NAME_INDEX = "entities_name_unique_idx";

/** The refusal of a name an entity of the ruleset's own has, whichever path asks. */
function toOwnNameError(name: string) {
  return new ConflictError(`Name already exists in this ruleset: ${name}`);
}

/**
 * The names a ruleset's composed view shows (`new EntityNames(scope)`, a write's, under its lock), which no change
 * makes it show twice: a new entity, a renamed one, a restored one, a subscribed extension's and one an unsubscribe
 * shows again take a name only when no other entity of their kind the view shows has it in their partition (what a
 * race or a class is for: a familiar's Hawk and an animal companion's are two, as the name index holds them), or in
 * any partition for a kind a path names by its name alone (a class: `classes.familiar.level` would name two), the
 * ruleset's own or an inherited one. An inherited entity the view hides (overridden, or a sibling loser) doesn't block
 * its name, and one whose local copy was deleted left a tombstone snapshot, which a new entity of its name and
 * partition takes over (`repointTombstone`), so the inherited one stays hidden. Its instance methods take the
 * transaction; its static `withNameRefusal` runs a write that takes a name, answering the name index as the checks do.
 */
export default class EntityNames {
  constructor(private readonly scope: LockedRulesetScope) {}

  /**
   * Whether a subscriber's view (`cow`) would show another entity beside the book's entity under the name it takes
   * (`taken`), among the entities of that name its view's rulesets hold (`seen`): one the view shows, but what stands
   * for the book's entity there (the subscriber's copy of it). A book's entity the subscriber's copy stands for takes no
   * name there: the copy keeps its own, whatever the book's is (a book's entity the subscriber's own of its name hides
   * still takes its new one).
   */
  private static clashesIn(cow: CowData, seen: NamedEntity[], { name, standsFor }: TakenName): boolean {
    if (standsFor !== undefined && cow.isOverridden(standsFor) && !cow.isShadowed(standsFor)) return false;
    return seen.some(
      (entity) =>
        entity.name === name &&
        !cow.isHidden(entity.id) &&
        (standsFor === undefined || cow.resolve(entity.id) !== cow.resolve(standsFor)),
    );
  }

  /**
   * The names of `entities`, each once, by their type, in the order their base rules' module declares the types
   * (`baseRules`).
   */
  private static namesByType(baseRules: BaseRules, entities: { entityType: RulesetEntityType; name: string }[]) {
    const byType = Map.groupBy(entities, (entity) => entity.entityType);
    return new Map(
      Engine.forRules(baseRules)
        .storage()
        .standaloneKinds()
        .map((type) => [type, [...new Set((byType.get(type) ?? []).map((entity) => entity.name))]]),
    );
  }

  /**
   * Runs `write`, which gives an entity of the ruleset the name `name` (none: a row without one, which the index
   * doesn't hold), answering the name index's refusal as the check answers the ruleset's own name: two saves that take
   * one name at once both pass the check, and the second one's write meets the index.
   */
  static async withNameRefusal<T>(name: string | undefined, write: () => Promise<T>) {
    return await withUniqueRefusal(write, (index) => (index === NAME_INDEX ? toOwnNameError(name ?? "") : undefined));
  }

  /** The ruleset's copy-on-write data, as its view was read under the write's lock. */
  private get cow(): CowData {
    return this.scope.rulesetData.cow;
  }

  /**
   * Whether a kind's names are its own across its partitions: a path names its entities by their name alone
   * (`Engine.rules().pathNamedKindsOf`: a class, never a race, whose name a path holds in a value, with its partition).
   */
  private isPathNamed(entityType: RulesetEntityType): boolean {
    return Engine.rules().pathNamedKindsOf(this.scope.ruleset.baseRules).includes(entityType);
  }

  /** The key two entities of a kind (`entityType`) share a name by: their name, within their partition (`rivalsOf`). */
  private keyOf(entityType: RulesetEntityType, entity: { name: string; partition: string }) {
    return this.isPathNamed(entityType) ? entity.name : `${entity.partition}\u0000${entity.name}`;
  }

  /** The partition a new entity of a kind takes (`entityType`'s): its base rules' storage's (3.5's race's `pc`). */
  private partitionOf(entityType: RulesetEntityType): string {
    return Engine.forRules(this.scope.ruleset.baseRules).storage().partitionOf(entityType);
  }

  /**
   * Refuses the names an entity of the view has (`named`, those of the partition the name is taken in): the ruleset's
   * own, or a visible inherited entity's.
   */
  private refuseShown(named: NamedEntity[]) {
    const own = named.find((entity) => entity.rulesetId === this.ruleset.id);
    if (own) throw toOwnNameError(own.name);

    const shown = named.find((entity) => !this.cow.isHidden(entity.id));
    if (shown) {
      throw new ConflictError(
        `Name already exists in the source chain (an ancestor or subscribed extension): ${shown.name}`,
      );
    }
  }

  /**
   * The entities among `named` (of a kind, `entityType`) a name in a partition (`partition`) is taken against: those
   * of the partition, or all of them for a kind a path names by its name alone (`isPathNamed`).
   */
  private rivalsOf(entityType: RulesetEntityType, named: NamedEntity[], partition: string): NamedEntity[] {
    return this.isPathNamed(entityType) ? named : named.filter((entity) => entity.partition === partition);
  }

  /** The ruleset and its sources. */
  private get ruleset(): RulesetSources {
    return this.scope.sources;
  }

  /**
   * The entities of a kind named `names`, the ruleset's own and its source chain's (`chain`: its own, unless given), of
   * every partition.
   */
  private async findNamed(
    tx: Db,
    entityType: RulesetEntityType,
    names: string[],
    chain = this.cow.sourceChain,
  ): Promise<NamedEntity[]> {
    return await RulesetEntities.findNames(tx, { entityType, names, rulesetIds: [this.ruleset.id, ...chain] });
  }

  /**
   * The hidden ancestors among `ancestors` (of one partition) whose local copy was deleted (a tombstone snapshot), by
   * name: of two of a name, the closer (its ruleset first in the source chain). A live local copy keeps its snapshot
   * even after a rename, so inherited references keep resolving to it.
   */
  private async findTombstones(
    tx: Db,
    entityType: RulesetEntityType,
    ancestors: NamedEntity[],
  ): Promise<Map<string, string>> {
    const sourceEntityIds = ancestors.map((ancestor) => ancestor.id);
    const snapshots = await EntitySnapshots.findMany(tx, { sourceEntityIds, rulesetId: this.ruleset.id });
    const tombstoned = new Set<string>();
    for (const snapshot of snapshots) {
      // The local copy, as stored: deleted, it leaves the snapshot a tombstone
      if (!(await Entities.has(tx, { entityType, id: snapshot.forkedEntityId })))
        tombstoned.add(snapshot.sourceEntityId);
    }

    const chain = this.cow.sourceChain;
    const closestFirst = ancestors.toSorted((a, b) => chain.indexOf(a.rulesetId) - chain.indexOf(b.rulesetId));
    const tombstones = new Map<string, string>();
    for (const { id, name } of closestFirst) if (tombstoned.has(id) && !tombstones.has(name)) tombstones.set(name, id);
    return tombstones;
  }

  /**
   * Refuses a change to the ruleset's extensions when its view (`after`: its `CowData` once they're changed) would then
   * show more entities of a kind under one of `names` (by kind) in one partition than once, and than it shows now
   * (`refusal` says so).
   * What the view pairs under one name shows one (a book's copy of an inherited entity, the reprints and the lists the
   * source chain pairs), and a name it already shows twice stays allowed. A book's entity the ruleset's own of its name
   * shadows counts as shown: the ruleset is told of the clash its change makes rather than lose the book's entity.
   * `leaving`: the ruleset's own entities the change removes (an unsubscribe's copies of the book's entities).
   */
  private async refuseChainNames(
    tx: Db,
    after: CowData,
    names: ReadonlyMap<RulesetEntityType, string[]>,
    leaving: ReadonlySet<string>,
    refusal: (entityType: RulesetEntityType, name: string) => string,
  ) {
    const shown = (cow: CowData, id: string) => !cow.isHidden(id) || cow.isShadowed(id);
    const before = new Set([this.ruleset.id, ...this.cow.sourceChain]);
    const remaining = new Set([this.ruleset.id, ...after.sourceChain]);
    const chain = [...new Set([...this.cow.sourceChain, ...after.sourceChain])];
    for (const [entityType, typeNames] of names) {
      const named = await this.findNamed(tx, entityType, typeNames, chain);
      for (const entities of Map.groupBy(named, (entity) => this.keyOf(entityType, entity)).values()) {
        const [{ name }] = entities;
        const shownBefore = entities.filter(({ id, rulesetId }) => before.has(rulesetId) && shown(this.cow, id));
        const shownAfter = entities.filter(
          ({ id, rulesetId }) => remaining.has(rulesetId) && !leaving.has(id) && shown(after, id),
        );
        if (shownAfter.length > Math.max(shownBefore.length, 1)) throw new ConflictError(refusal(entityType, name));
      }
    }
  }

  /**
   * Refuses names a book's entities take (`taken`, in `partition`: a create's, a rename's, a restore's) when a ruleset
   * subscribed to the book shows another entity of one in its view: its own, which would hide the book's there, so that
   * what names the book's (a character's pick, a class's grant) would read the subscriber's instead; or another book's
   * or its parent's, which would show beside it or pair with it. One that stands for the book's very entity there (the
   * subscriber's copy of it: `standsFor`, the entity renamed or restored, or the ancestor whose tombstone a new one takes
   * over) is none. The refusal names the entity, never the subscriber, another user's ruleset. One read of the names
   * for every subscriber, and a subscriber's `CowData` only when that read found one in its view; the book's own chain
   * is left to the book's own check (`refuseShown`), since its subscribers' views hide what the book's hides.
   */
  private async refuseSubscribersShown(
    tx: Db,
    entityType: RulesetEntityType,
    partition: string,
    taken: TakenName[],
  ): Promise<void> {
    if (this.scope.ruleset.kind !== "extension") return;
    const book = new Set([this.ruleset.id, ...this.cow.sourceChain]);
    const names = taken.map((each) => each.name);
    const found = await RulesetEntities.findNames(tx, { entityType, names, subscribersOf: this.ruleset.id });
    const rivals = this.rivalsOf(
      entityType,
      found.filter((entity) => !book.has(entity.rulesetId)),
      partition,
    );
    if (rivals.length === 0) return;
    for (const { id } of await Rulesets.findMany(tx, { subscribedTo: this.ruleset.id })) {
      const sources = await Rulesets.findSources(tx, { id });
      if (!sources) continue;
      const viewed = new Set([id, ...Engine.forRules(sources.baseRules).copyOnWrite().buildSourceChain(sources)]);
      const seen = rivals.filter((entity) => viewed.has(entity.rulesetId));
      if (seen.length === 0) continue;
      const cow = await CowDataReader.read(tx, sources);
      const clash = taken.find((each) => EntityNames.clashesIn(cow, seen, each));
      if (clash)
        throw new ConflictError(`Name already exists in a ruleset subscribed to this extension: ${clash.name}`);
    }
  }

  /**
   * Refuses subscribing the ruleset to new extensions (`extensionIds`) when its view would then show more entities of a
   * kind under a name than once, and than it shows now (`refuseChainNames`, with `CowData` read as the view would read
   * it once subscribed): an extension's entity (its own, or its copy of an inherited one, by its name) named as one the
   * view shows, or as another the extensions bring.
   */
  async assertExtensionNamesAvailable(tx: Db, extensionIds: string[]): Promise<void> {
    const subscribed = [...this.ruleset.extensionIds, ...extensionIds];
    const after = await CowDataReader.read(tx, { ...this.ruleset, extensionIds: subscribed });
    const brought = await RulesetEntities.findNames(tx, { rulesetIds: extensionIds });
    await this.refuseChainNames(
      tx,
      after,
      EntityNames.namesByType(this.scope.ruleset.baseRules, brought),
      new Set(),
      (entityType, name) =>
        `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset or another subscribed extension`,
    );
  }

  /**
   * Refuses the name of an entity a save's plan makes beside the one it writes (`made`, of `entityType`, in its
   * partition, a new one's of the kind unless given: a skill's feat), which the plan checked against the ruleset's
   * view, where a subscriber's view shows another entity of it (`refuseSubscribersShown`), as a create's is;
   * `standsFor`: the ancestor whose tombstone it takes over.
   */
  async assertMadeNameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    made: { name: string; partition?: string },
    standsFor: string | null,
  ): Promise<void> {
    const partition = made.partition ?? this.partitionOf(entityType);
    await this.refuseSubscribersShown(tx, entityType, partition, [
      { name: made.name, standsFor: standsFor ?? undefined },
    ]);
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
   * Refuses new entities' names (`names`, in the partition a new entity of the kind takes, `partitionOf`): one given
   * twice among them (a list of variants), and one the view shows there: one the ruleset has, or a visible inherited
   * entity has (the source chain's, an ancestor's or a subscribed extension's), named in the refusal. Returns, by name,
   * the closest hidden ancestor of the partition whose local copy was deleted (a tombstone), which a new entity of that
   * name takes over (`repointTombstone`).
   */
  async assertNamesAvailable(tx: Db, entityType: RulesetEntityType, names: string[]): Promise<Map<string, string>> {
    if (new Set(names).size !== names.length) throw new ConflictError("A name is given twice in the list");
    const partition = this.partitionOf(entityType);
    const named = this.rivalsOf(entityType, await this.findNamed(tx, entityType, names), partition);
    this.refuseShown(named);
    const tombstones = await this.findTombstones(tx, entityType, named);
    const taken = names.map((name) => ({ name, standsFor: tombstones.get(name) }));
    await this.refuseSubscribersShown(tx, entityType, partition, taken);
    return tombstones;
  }

  /**
   * Refuses renaming an entity (`entity`, as the view has it) to a name the view shows in its partition, as a create's
   * is: the name it keeps is its own, whoever else has it (an inherited entity's first edit copies it under its name).
   * A renamed entity takes over no tombstone: the copy it may be keeps its own snapshot, and the hidden ancestor of its
   * new name stays hidden. An inherited entity the same write renamed before (`vacated`, by its id) no longer shows its
   * name: the copy the write made of it hides it, which the view read before the write doesn't know yet.
   */
  async assertRenameAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; name: string; partition: string },
    name: string,
    vacated: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    if (name === entity.name) return;
    const named = this.rivalsOf(entityType, await this.findNamed(tx, entityType, [name]), entity.partition);
    this.refuseShown(named.filter((other) => !vacated.has(other.id)));
    await this.refuseSubscribersShown(tx, entityType, entity.partition, [{ name, standsFor: entity.id }]);
  }

  /**
   * Refuses restoring an inherited entity (`sourceEntityId`) in place of the ruleset's copy of it (`copyId`, gone when
   * the copy was deleted: a tombstone) when the view shows another entity of the source's name in its partition: a
   * restore renames the view's entity back to its source's name, or shows a deleted one again, as a rename or a create
   * would.
   */
  async assertRestoreAvailable(
    tx: Db,
    entityType: RulesetEntityType,
    sourceEntityId: string,
    copyId: string,
  ): Promise<void> {
    const entities = await RulesetEntities.findNames(tx, { entityType, ids: [sourceEntityId, copyId] });
    const source = entities.find((entity) => entity.id === sourceEntityId);
    const copy = entities.find((entity) => entity.id === copyId);
    if (!source || copy?.name === source.name) return;
    this.refuseShown(this.rivalsOf(entityType, await this.findNamed(tx, entityType, [source.name]), source.partition));
    await this.refuseSubscribersShown(tx, entityType, source.partition, [{ name: source.name, standsFor: copyId }]);
  }

  /**
   * Refuses unsubscribing the ruleset from an extension (`departure`) when its view would then show more entities of a
   * kind under a name than once, and than it shows now (`refuseChainNames`, with the view it shows once unsubscribed,
   * `departure.after`): what the extension hid shows again under its name (a core entity it copied, its copies'
   * siblings, a reprint it won over), which the ruleset may have given another entity since. The ruleset's copies of
   * the extension's entities (`departure.copyIds`) go with it.
   */
  async assertReturningNamesAvailable(tx: Db, departure: ExtensionDeparture): Promise<void> {
    const { after, copyIds } = departure;
    const remaining = new Set([this.ruleset.id, ...after.sourceChain]);
    const returning = this.cow.getStaleIds().filter((id) => !after.isHidden(id));
    const shown = await RulesetEntities.findNames(tx, { ids: returning });
    await this.refuseChainNames(
      tx,
      after,
      EntityNames.namesByType(
        this.scope.ruleset.baseRules,
        shown.filter((entity) => remaining.has(entity.rulesetId)),
      ),
      new Set(copyIds),
      (entityType, name) =>
        `Cannot unsubscribe: ${entityType} "${name}", which this extension replaces, would show again beside another of its name: rename that one first`,
    );
  }

  /**
   * The closest hidden ancestor of a name (`name`, of `entityType`, in its `partition`: a new one's of the kind, unless
   * given) whose local copy the ruleset deleted (a tombstone), which an entity a save makes under that name takes over
   * (`repointTombstone`), as a create's does; none without one. It refuses nothing: what the view shows, the save's
   * plan checked, and the ruleset's own names the index holds.
   */
  async findTombstoneAncestor(
    tx: Db,
    entityType: RulesetEntityType,
    name: string,
    partition = this.partitionOf(entityType),
  ): Promise<string | null> {
    const named = this.rivalsOf(entityType, await this.findNamed(tx, entityType, [name]), partition);
    const tombstones = await this.findTombstones(tx, entityType, named);
    return tombstones.get(name) ?? null;
  }

  /**
   * Points the tombstone snapshot a deleted local copy of `ancestorEntityId` left at the new entity of its name, so the
   * inherited entity stays hidden behind it.
   */
  async repointTombstone(tx: Db, ancestorEntityId: string, newEntityId: string): Promise<void> {
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
      sourceEntityId: ancestorEntityId,
      forkedEntityId: newEntityId,
    });
  }
}
