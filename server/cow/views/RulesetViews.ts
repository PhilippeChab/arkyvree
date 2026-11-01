import type { Db } from "@/drizzle/database.ts";
import { type CowData, Engine, type RulesetData, type RulesetRawData, type RulesetSources } from "@/engine/index.ts";
import { DependentCache } from "@/server/cache/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";
import type { BaseRules } from "@/shared/enums.ts";

import CowDataReader from "./CowDataReader.ts";
import RawDataReader from "./RawDataReader.ts";
import type { RulesetScope, SharedRulesetScope } from "./scope.ts";

/**
 * What the cache keeps of a ruleset (`value`), and the content versions of the rulesets whose writes reach it, as they
 * were read before it (`versions`): a write under its lock tells it from the rows committed since by them.
 */
interface Versioned<T> {
  value: T;
  versions: ReadonlyMap<string, number>;
}

/**
 * A ruleset and its sources: what its target paths are listed of; a write's, under its locks (a `LockedRulesetScope`,
 * a `SharedRulesetScope`), with its view and the versions its locks read.
 */
type TargetPathScope = Pick<RulesetScope, "ruleset" | "sources"> &
  Partial<Pick<SharedRulesetScope, "rulesetData" | "versions">>;

/**
 * The rulesets' cache: what a ruleset's view is built from, read once and kept for every reader, and what the engine
 * lists of a view. Per ruleset, it keeps its copy-on-write data (`CowDataReader`), its own rows (`RawDataReader`, a
 * system ruleset's pinned: every fork reads them) and its target paths, each with the content versions it was read at,
 * and composes a view from them on each read (`getData`). A read reads committed rows only, through the shared `db`,
 * never a transaction's: a change's uncommitted rows would reach every reader. A change to a ruleset drops what depends
 * on it (`invalidate`). A write, under its lock, reads its view fresh (`getFreshData`): what the cache keeps at the
 * versions its lock read, else read again through its transaction, before it writes anything. A service reads a view
 * through `withRulesetScope`, and a write through its helper (`scope.ts`).
 */
class RulesetViews {
  /**
   * Whether what the cache keeps was read at the versions a write's lock read (`current`), each of the rulesets whose
   * writes reach it (`ids`): an entry tagged with fewer (read before a subscribe added an extension, or a read's target
   * paths, tagged with none) isn't.
   */
  private static isCurrent({ versions }: Versioned<unknown>, current: ReadonlyMap<string, number>, ids: string[]) {
    return ids.every((id) => versions.has(id) && versions.get(id) === current.get(id));
  }

  /**
   * The rulesets whose writes reach a ruleset's own rows (`rulesetId`, of the chain `ruleset` reads): its own, and, of
   * the ruleset read, its source chain's: an extension's restore repoints the rows naming the copy it removes, and a
   * delete in any of them unlinks the rows naming what it deletes (the database's `apply_delete_rules`).
   */
  private static rowWritersOf(rulesetId: string, ruleset: RulesetSources) {
    if (rulesetId !== ruleset.id) return [rulesetId];
    return [rulesetId, ...ruleset.extensionIds, ...(ruleset.parentId ? [ruleset.parentId] : [])];
  }

  /** The versions of `ids`, of those a write's lock read (`current`). */
  private static versionsOf(ids: readonly string[], current: ReadonlyMap<string, number>) {
    return new Map(ids.flatMap((id) => (current.has(id) ? [[id, current.get(id)!] as const] : [])));
  }

  private readonly cowData = new DependentCache<Versioned<CowData>>();

  private readonly rawData = new DependentCache<Versioned<RulesetRawData>>();

  private readonly targetPaths = new DependentCache<Versioned<TargetPathCatalog>>();

  /** The engine's list of a ruleset's target paths of a kind, from its view: a write's own, else the cache's. */
  private async listTargetPaths(scope: TargetPathScope, kind: TargetPathKind): Promise<TargetPathCatalog> {
    const { ruleset, sources } = scope;
    const rulesetData = scope.rulesetData ?? (await this.getData(sources, ruleset.baseRules));
    return Engine.for({ ruleset, rulesetData }).targetPaths().list(kind);
  }

  /** A ruleset's own rows, read through the shared `db` after the versions of the rulesets whose writes reach them. */
  private async readRawData(rulesetId: string, writerIds: string[]) {
    const versions = await Rulesets.findVersions(db, { ids: writerIds });
    const { data, pinned } = await RawDataReader.read(rulesetId);
    return { data: { value: data, versions }, pinned };
  }

  /** Drops what a change to a ruleset can touch: its copy-on-write data, its rows and its target paths. */
  invalidate(rulesetId: string): void {
    this.invalidateEntities(rulesetId);
    this.targetPaths.invalidate(rulesetId);
  }

  /** Drops everything the cache holds. */
  invalidateAll(): void {
    this.cowData.invalidateAll();
    this.rawData.invalidateAll();
    this.targetPaths.invalidateAll();
  }

  /** Drops a ruleset's copy-on-write data and rows, for a change that leaves its target paths (a requirement's). */
  invalidateEntities(rulesetId: string): void {
    this.cowData.invalidate(rulesetId);
    this.rawData.invalidate(rulesetId);
  }

  /**
   * A ruleset's copy-on-write data: its source chain, its overrides and sibling pairs. Keyed by the ruleset and its
   * ordered source chain: a request holding old ruleset metadata must not cache its old subscription chain under the
   * key readers of the newly committed chain use. Read through the shared `db`, never a transaction.
   */
  async getCowData(ruleset: RulesetSources): Promise<CowData> {
    const dependencies = [ruleset.id, ...Engine.copyOnWrite().buildSourceChain(ruleset)];
    const entry = await this.cowData.getOrFetch(JSON.stringify(dependencies), dependencies, async () => {
      const versions = await Rulesets.findVersions(db, { ids: dependencies });
      return { data: { value: await CowDataReader.read(db, ruleset), versions } };
    });
    return entry.value;
  }

  /**
   * A ruleset's view, of its sources (`ruleset`) and its base rules: its own rows and its source chain's, composed by its
   * copy-on-write data.
   */
  async getData(ruleset: RulesetSources, baseRules: BaseRules): Promise<RulesetData> {
    const cowData = await this.getCowData(ruleset);
    const chain = await Promise.all(
      [ruleset.id, ...cowData.sourceChain].map((id) => this.getRawData(id, RulesetViews.rowWritersOf(id, ruleset))),
    );
    return Engine.copyOnWrite().buildView({ baseRules }, chain, cowData);
  }

  /**
   * A ruleset's view as a write under its lock reads it (`tx`, its transaction; `current`, the content versions its
   * lock read of the ruleset and its source chain, committed): the copy-on-write data and rows the cache keeps at
   * those versions, and those it keeps at others read again through the transaction, one query at a time, before the
   * write writes anything, so they're the committed rows its locks hold, which the cache keeps in their place.
   */
  async getFreshData(
    tx: Db,
    ruleset: RulesetSources,
    baseRules: BaseRules,
    current: ReadonlyMap<string, number>,
  ): Promise<RulesetData> {
    const dependencies = [ruleset.id, ...Engine.copyOnWrite().buildSourceChain(ruleset)];
    const cowEntry = await this.cowData.getOrFetch(
      JSON.stringify(dependencies),
      dependencies,
      async () => ({
        data: {
          value: await CowDataReader.read(tx, ruleset),
          versions: RulesetViews.versionsOf(dependencies, current),
        },
      }),
      (cached) => RulesetViews.isCurrent(cached, current, dependencies),
    );
    const chain: RulesetRawData[] = [];
    for (const id of [ruleset.id, ...cowEntry.value.sourceChain]) {
      const writers = RulesetViews.rowWritersOf(id, ruleset);
      const entry = await this.rawData.getOrFetch(
        id,
        [id],
        async () => {
          const { data, pinned } = await RawDataReader.read(id, tx);
          return { data: { value: data, versions: RulesetViews.versionsOf(writers, current) }, pinned };
        },
        (cached) => RulesetViews.isCurrent(cached, current, writers),
      );
      chain.push(entry.value);
    }
    return Engine.copyOnWrite().buildView({ baseRules }, chain, cowEntry.value);
  }

  /**
   * A ruleset's own rows, none of its ancestors': pinned when it's a system ruleset. Tagged with the versions of the
   * rulesets whose writes reach them (`writerIds`: its own, and a fork's extensions').
   */
  async getRawData(rulesetId: string, writerIds = [rulesetId]): Promise<RulesetRawData> {
    const entry = await this.rawData.getOrFetch(rulesetId, [rulesetId], () => this.readRawData(rulesetId, writerIds));
    return entry.value;
  }

  /** A ruleset's target paths of a kind, and its template paths: what a modifier's or a requirement's check reads. */
  async getTargetPathCatalogs(scope: TargetPathScope, kind: "modifier" | "requirement") {
    return {
      paths: await this.getTargetPaths(scope, kind),
      templatePaths: await this.getTargetPaths(scope, "template"),
    };
  }

  /**
   * A ruleset's target paths for a modifier, a requirement or a template, and their segments' labels, as the engine
   * lists them from its view: kept for the ruleset and its source chain, a change to any of which drops them. Listed
   * inside the cache's fill, so a change during the listing keeps its late result out. A write's, under its lock (its
   * scope's `versions`), lists them from its own view unless the cache keeps them at the versions its lock read, a
   * write's own listing: a read's, listed from a view composed before, is tagged with none.
   */
  async getTargetPaths(scope: TargetPathScope, kind: TargetPathKind): Promise<TargetPathCatalog> {
    const { sources, versions: current } = scope;
    const sourceChain = Engine.copyOnWrite().buildSourceChain(sources);
    // Old subscription metadata must not populate the key for the new chain.
    const key = JSON.stringify([sources.id, kind, ...sourceChain]);
    const dependencies = [sources.id, ...sourceChain];
    const entry = await this.targetPaths.getOrFetch(
      key,
      dependencies,
      async () => {
        // A read's are listed from a view composed before (its scope's), whose versions it can't tell: tagged with
        // none, no write trusts them
        const versions = current ? RulesetViews.versionsOf(dependencies, current) : new Map<string, number>();
        return { data: { value: await this.listTargetPaths(scope, kind), versions } };
      },
      current && ((cached) => RulesetViews.isCurrent(cached, current, dependencies)),
    );
    return entry.value;
  }

  /** Loads the system rulesets' rows (the bases and the extensions), at boot: the first user doesn't wait for them. */
  async warm(): Promise<void> {
    const systemRulesets = await Rulesets.findMany(db, { system: true });
    await Promise.all(systemRulesets.map((r) => this.getRawData(r.id)));
  }
}

export default new RulesetViews();
