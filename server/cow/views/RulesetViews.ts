import { type CowData, Engine, type RulesetData, type RulesetRawData, type RulesetSources } from "@/engine/index.ts";
import { DependentCache } from "@/server/cache/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";
import type { BaseRules } from "@/shared/enums.ts";

import CowDataReader from "./CowDataReader.ts";
import RawDataReader from "./RawDataReader.ts";
import type { RulesetScope } from "./scope.ts";

/** A ruleset and its sources: what its target paths are listed of. */
type TargetPathScope = Pick<RulesetScope, "ruleset" | "sources">;

/**
 * The rulesets' cache: what a ruleset's view is built from, read once and kept for every reader, and what the engine
 * lists of a view. Per ruleset, it keeps its copy-on-write data (`CowDataReader`), its own rows (`RawDataReader`, a
 * system ruleset's pinned: every fork reads them) and its target paths, and composes a view from them on each read
 * (`getData`). It reads committed rows only, through the shared `db`, never a transaction's: a change's uncommitted rows
 * would reach every reader. A change to a ruleset drops what depends on it (`invalidate`). A service reads a view
 * through `withRulesetScope` (`scope.ts`).
 */
class RulesetViews {
  private readonly cowData = new DependentCache<CowData>();

  private readonly rawData = new DependentCache<RulesetRawData>();

  private readonly targetPaths = new DependentCache<TargetPathCatalog>();

  /** The engine's list of a ruleset's target paths of a kind, from its view. */
  private async listTargetPaths(scope: TargetPathScope, kind: TargetPathKind): Promise<TargetPathCatalog> {
    const { ruleset, sources } = scope;
    return Engine.for({ ruleset, rulesetData: await this.getData(sources, ruleset.baseRules) })
      .targetPaths()
      .list(kind);
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
    return this.cowData.getOrFetch(JSON.stringify(dependencies), dependencies, async () => ({
      data: await CowDataReader.read(db, ruleset),
    }));
  }

  /**
   * A ruleset's view, of its sources (`ruleset`) and its base rules: its own rows and its source chain's, composed by its
   * copy-on-write data.
   */
  async getData(ruleset: RulesetSources, baseRules: BaseRules): Promise<RulesetData> {
    const cowData = await this.getCowData(ruleset);
    const chain = await Promise.all([ruleset.id, ...cowData.sourceChain].map((id) => this.getRawData(id)));
    return Engine.copyOnWrite().buildView({ baseRules }, chain, cowData);
  }

  /** A ruleset's own rows, none of its ancestors': pinned when it's a system ruleset. */
  async getRawData(rulesetId: string): Promise<RulesetRawData> {
    return this.rawData.getOrFetch(rulesetId, [rulesetId], () => RawDataReader.read(rulesetId));
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
   * inside the cache's fill, so a change during the listing keeps its late result out.
   */
  async getTargetPaths(scope: TargetPathScope, kind: TargetPathKind): Promise<TargetPathCatalog> {
    const { sources } = scope;
    const sourceChain = Engine.copyOnWrite().buildSourceChain(sources);
    // Old subscription metadata must not populate the key for the new chain.
    const key = JSON.stringify([sources.id, kind, ...sourceChain]);
    return this.targetPaths.getOrFetch(key, [sources.id, ...sourceChain], async () => ({
      data: await this.listTargetPaths(scope, kind),
    }));
  }

  /** Loads the system rulesets' rows (the bases and the extensions), at boot: the first user doesn't wait for them. */
  async warm(): Promise<void> {
    const systemRulesets = await Rulesets.findMany(db, { system: true });
    await Promise.all(systemRulesets.map((r) => this.getRawData(r.id)));
  }
}

export default new RulesetViews();
