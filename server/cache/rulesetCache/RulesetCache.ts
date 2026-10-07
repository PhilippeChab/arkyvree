import { type CowData } from "@/engine/core/cow/index.ts";
import { RulesetComposition, type RulesetData, type RulesetRawData } from "@/engine/core/view/index.ts";
import DependentCache from "@/server/cache/DependentCache.ts";
import { db, withCowContext } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { TargetPath, TargetPathKind } from "@/shared/customization/target.ts";
import { sortProperties } from "@/shared/dnd3.5/properties/index.ts";

import CowDataBuilder, { buildSourceChain, type RulesetSources } from "./CowDataBuilder.ts";
import { fetchRulesetRawData } from "./rawData.ts";

type TargetPathsAndLabels = { paths: TargetPath[]; segmentLabels: Record<string, string> };

/** A ruleset's own rows' key: a campaign's are its own. */
function getRawDataKey(rulesetId: string, campaignId?: string): string {
  return campaignId ? `${rulesetId}:${campaignId}` : rulesetId;
}

/**
 * The rulesets' cache, read through `withRulesetScope` (`scope.ts`). It holds each ruleset's copy-on-write data, each
 * ruleset's own rows, a system ruleset's pinned (every fork reads them), which compose into a ruleset's view on each
 * read, and each ruleset's target paths. It reads committed rows only, through the shared `db`, never a
 * transaction's: a change's uncommitted rows would reach every reader. A change to a ruleset invalidates what it
 * touched (`invalidate`).
 */
class RulesetCache {
  private readonly cowData = new DependentCache<CowData>();

  private readonly rawData = new DependentCache<RulesetRawData>();

  private readonly targetPaths = new DependentCache<TargetPathsAndLabels>();

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

  /** Whether a ruleset's own rows are pinned, kept whatever else the cache evicts. */
  isRawDataPinned(rulesetId: string, campaignId?: string): boolean {
    return this.rawData.isPinned(getRawDataKey(rulesetId, campaignId));
  }

  /**
   * A ruleset's copy-on-write data: its source chain, its overrides and sibling pairs. Keyed by the ruleset and its
   * ordered source chain: a request holding old ruleset metadata must not cache its old subscription chain under the
   * key readers of the newly committed chain use. Built from stored ids through the shared `db`, never through the
   * copy-on-write context of a scope it's read in, or a transaction.
   */
  async getCowData(ruleset: RulesetSources): Promise<CowData> {
    const dependencies = [ruleset.id, ...buildSourceChain(ruleset)];
    return this.cowData.getOrFetch(JSON.stringify(dependencies), dependencies, async () => ({
      data: await CowDataBuilder.build(db, ruleset),
    }));
  }

  /** A ruleset's view: its own rows and its source chain's, composed by its copy-on-write data. */
  async getData(ruleset: RulesetSources, campaignId?: string): Promise<RulesetData> {
    const cowData = await this.getCowData(ruleset);
    const chain = await Promise.all([
      this.getRawData(ruleset.id, campaignId),
      ...cowData.sourceChain.map((id) => this.getRawData(id)),
    ]);
    return new RulesetComposition(chain, cowData, sortProperties).build();
  }

  /** A ruleset's own rows (a campaign's, with one), none of its ancestors': pinned when it's a system ruleset. */
  async getRawData(rulesetId: string, campaignId?: string): Promise<RulesetRawData> {
    return this.rawData.getOrFetch(getRawDataKey(rulesetId, campaignId), [rulesetId], () =>
      withCowContext(undefined, () => fetchRulesetRawData(rulesetId, campaignId)),
    );
  }

  /** A ruleset's target paths for a modifier, a requirement or a template, and their segments' labels. */
  async getTargetPaths(
    rulesetId: string,
    kind: TargetPathKind,
    fetcher: () => Promise<TargetPathsAndLabels>,
    sourceChain: readonly string[] = [],
  ): Promise<TargetPathsAndLabels> {
    // Old subscription metadata must not populate the key for the new chain.
    const key = JSON.stringify([rulesetId, kind, ...sourceChain]);
    return this.targetPaths.getOrFetch(key, [rulesetId, ...sourceChain], async () => ({ data: await fetcher() }));
  }

  /** Loads the system rulesets' rows (the bases and the extensions), at boot: the first user doesn't wait for them. */
  async warm(): Promise<void> {
    const systemRulesets = await Rulesets.findMany(db, { system: true });
    await Promise.all(systemRulesets.map((r) => this.getRawData(r.id)));
  }
}

export default new RulesetCache();
