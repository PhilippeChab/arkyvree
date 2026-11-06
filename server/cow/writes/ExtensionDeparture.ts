import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type OwnedKind, type RulesetSources } from "@/engine/index.ts";
import CowDataReader from "@/server/cow/views/CowDataReader.ts";
import RulesetChanges from "@/server/cow/views/RulesetChanges.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  EntityReferences,
  type ReferencedType,
  RulesetEntities,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import EntityUses from "./EntityUses.ts";
import { findOwnedPairs } from "./ownedPairs.ts";

/** The ruleset's copies of the extension's entities, by entity type: what the unsubscribe reverts, their rows with them. */
type Copies = ReadonlyMap<string, string[]>;

/**
 * What leaves the ruleset with the extension, by entity type: each id, with the id its view shows in its place once the
 * extension is gone, or `undefined` when nothing stands there.
 */
type Departures = ReadonlyMap<ReferencedType, ReadonlyMap<string, string | undefined>>;

/** How many lost references the refusal names. */
const NAMED_LOSSES = 10;

/**
 * What a ruleset keeps of an extension it unsubscribes from, in its scope (`ExtensionDeparture.read`, the
 * unsubscribe's, under its lock), worked out before the extension's content leaves it: its copies of the extension's
 * entities (`snapshots`, which the unsubscribe reverts), the view it shows once the extension is gone (`after`), and
 * what leaves it. What leaves is the extension's entities, the ruleset's copies of them, and what they own, each with
 * what the view shows in its place once the extension is gone, when anything does: the entity a copy stands for (a core
 * feat it overrides), or another extension's copy of it, which wins once this one is gone; a reprint's namesake; the
 * list of the same name the ruleset or another extension has, a list's name being its identity (`CowDataBuilder` pairs
 * namesakes); an owned entity (a class's level) its owner's fallback's of its position. What the ruleset and its
 * characters keep that names one names what stands in its place instead (`repoint`). What names one with nothing in
 * its place refuses the unsubscribe: a character's pick (`isInUse`), or one of the ruleset's rows (a link to a list no
 * other extension has, an item's template, a class's skill or granted feat…).
 */
export default class ExtensionDeparture {
  private constructor(
    private readonly scope: LockedRulesetScope,
    /** The ruleset's copies of the extension's entities, each with its source's type and id: what the unsubscribe reverts. */
    readonly snapshots: Awaited<ReturnType<typeof RulesetChanges.copiesOf>>,
    /** The ruleset's view once the extension is gone. */
    readonly after: CowData,
    private readonly copies: Copies,
    private readonly departures: Departures,
  ) {}

  /**
   * What leaves with the extension (`extensionId`), by entity type: its entities and the ruleset's copies of them
   * (`copies`), and what they own (their classes' levels), each with what the view shows in its place once the
   * extension is gone. That is the first of the ids the view (`before`) shows it for (`CowData.getEquivalentIds`: the
   * entity a copy stands for, the other extensions' copies of it and the namesakes paired with it) that stays, as the
   * view without the extension (`after`) resolves it, when that view shows it: a copy the ruleset deleted shows nothing.
   * Its kinds are its ruleset's (`ruleset`) base rules'.
   */
  private static async findDepartures(
    tx: Db,
    ruleset: RulesetSources,
    before: CowData,
    after: CowData,
    extensionId: string,
    copies: Copies,
  ): Promise<Departures> {
    const own = Map.groupBy(
      await RulesetEntities.findNames(tx, { rulesetId: extensionId }),
      (entity) => entity.entityType,
    );
    const leaving = new Map(
      Engine.storage(ruleset.baseRules)
        .standaloneKinds()
        .map((type) => [type, [...(own.get(type) ?? []).map((entity) => entity.id), ...(copies.get(type) ?? [])]]),
    );
    const left = new Set([...leaving.values()].flat());
    // What each stands in place of, in the view without the extension: an entity's equivalents are of its own kind
    const candidates = new Map(
      [...left].map((id) => [
        id,
        before
          .getEquivalentIds(id)
          .filter((other) => !left.has(other))
          .map((other) => after.resolve(other))
          .filter((other) => !after.isHidden(other)),
      ]),
    );
    const shown = [...new Set([...candidates.values()].flat())];
    const live = new Set((await RulesetEntities.findNames(tx, { ids: shown })).map((entity) => entity.id));

    const departures = new Map<ReferencedType, ReadonlyMap<string, string | undefined>>();
    for (const [type, ids] of leaving)
      departures.set(type, new Map(ids.map((id) => [id, candidates.get(id)!.find((other) => live.has(other))])));
    const storage = Engine.storage(ruleset.baseRules);
    for (const ownedType of storage.ownedTypes() as OwnedKind[]) {
      const ownerType = storage.ownerOf(ownedType) as RulesetEntityType;
      departures.set(ownedType, await findOwnedPairs(tx, ownedType, departures.get(ownerType)!));
    }
    return departures;
  }

  /**
   * What leaves the scope's ruleset with the extension (`extensionId`), its copies of the extension's entities as
   * copy-on-write reads its snapshots (`RulesetChanges.copiesOf`), and its view without the extension.
   */
  static async read(tx: Db, scope: LockedRulesetScope, extensionId: string): Promise<ExtensionDeparture> {
    const { sources } = scope;
    const snapshots = await RulesetChanges.copiesOf(tx, sources.id, extensionId);
    const after = await CowDataReader.read(tx, {
      ...sources,
      extensionIds: sources.extensionIds.filter((id) => id !== extensionId),
    });
    const copies: Copies = new Map(
      [...Map.groupBy(snapshots, (snap) => snap.entityType)].map(([type, snaps]) => [
        type,
        snaps.map((snap) => snap.forkedEntityId),
      ]),
    );
    const departures = await ExtensionDeparture.findDepartures(
      tx,
      sources,
      scope.rulesetData.cow,
      after,
      extensionId,
      copies,
    );
    return new ExtensionDeparture(scope, snapshots, after, copies, departures);
  }

  /** The ids of what leaves with nothing in its place. */
  private get stranded(): string[] {
    return [...this.departures.values()].flatMap((fallbacks) =>
      [...fallbacks].filter(([, fallbackId]) => !fallbackId).map(([id]) => id),
    );
  }

  /**
   * The ruleset's rows naming what leaves with nothing in its place (`EntityReferences.findMany`), as the refusal names
   * them: a link to a list no other extension has, or a row naming another of the extension's entities (an item's
   * template, a class's skill or granted feat…). The copies' own rows, which go with them, are left out.
   */
  private async findLostReferences(tx: Db): Promise<string[]> {
    const typeOf = new Map<string, RulesetEntityType>();
    for (const type of Engine.storage(this.scope.ruleset.baseRules).standaloneKinds())
      for (const [id, fallbackId] of this.departures.get(type) ?? []) if (!fallbackId) typeOf.set(id, type);
    const deleted = new Set(this.copyIds);
    const references = (
      await EntityReferences.findMany(tx, { rulesetId: this.scope.sources.id, entityIds: [...typeOf.keys()] })
    ).filter((reference) => !deleted.has(reference.id));
    const targetIds = [...new Set(references.map((reference) => reference.targetId))];
    const names = new Map(
      (await RulesetEntities.findNames(tx, { ids: targetIds })).map((entity) => [entity.id, entity.name]),
    );
    return references.map((reference) =>
      Engine.storage(this.scope.ruleset.baseRules).isIdentityKind(typeOf.get(reference.targetId)!)
        ? `${names.get(reference.targetId)}, a list no other book of this ruleset has`
        : `${reference.name}, which uses ${names.get(reference.targetId)}`,
    );
  }

  /** The ids of the ruleset's copies of the extension's entities, which go with it. */
  get copyIds(): string[] {
    return [...this.copies.values()].flat();
  }

  /**
   * Whether a character on the ruleset picked what leaves its view with the extension with nothing in its place (an
   * entity only the extension has), or a level of a class the class standing in its place doesn't have: the pick would
   * dangle (`EntityUses.isAnyPicked`). A pick of what the view shows something else in place of (a core feat the
   * extension overrides) names that instead (`repoint`).
   */
  async isInUse(tx: Db): Promise<boolean> {
    return await new EntityUses(this.scope).isAnyPicked(tx, this.stranded);
  }

  /**
   * Points what the ruleset and its characters keep that names what leaves with the extension at what stands in its
   * place, or refuses when one of the ruleset's rows names one with nothing in its place (a `ConflictError` naming
   * them), before anything changes. The copies' own rows go with them.
   */
  async repoint(tx: Db): Promise<void> {
    const rulesetId = this.scope.sources.id;
    const lost = [...new Set(await this.findLostReferences(tx))];
    if (lost.length > 0) {
      const more = lost.length > NAMED_LOSSES ? ` and ${lost.length - NAMED_LOSSES} more` : "";
      throw new ConflictError(
        `Cannot unsubscribe: this ruleset's content uses what only this extension has: ${lost.slice(0, NAMED_LOSSES).join("; ")}${more}`,
      );
    }

    const replaced = [...this.departures.values()].flatMap((fallbacks) =>
      [...fallbacks].filter(([, fallbackId]) => fallbackId).map(([id]) => id),
    );
    const named = new Set(await EntityReferences.findIds(tx, { entityIds: replaced, rulesetId }));
    for (const fallbacks of this.departures.values()) {
      for (const [entityId, fallbackId] of fallbacks) {
        if (fallbackId && named.has(entityId))
          await EntityReferences.update(tx, { entityId: fallbackId }, { entityId, rulesetId });
      }
    }
  }
}
