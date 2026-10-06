import DependentCache from "@/server/cache/DependentCache.ts";
import { db, withCowContext } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { invalidateAllCowData, invalidateCowData } from "@/server/services/rulesets/cow/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

import { buildRulesetData, type CachedCowData, type CachedRulesetData } from "./compose.ts";
import { fetchRulesetRawData, type RulesetRawData } from "./rawData.ts";

type TargetPathsAndLabels = { paths: TargetPath[]; segmentLabels: Record<string, string> };

/** A ruleset's own rows' key: a campaign's are its own. */
function getRawDataKey(rulesetId: string, campaignId?: string): string {
  return campaignId ? `${rulesetId}:${campaignId}` : rulesetId;
}

/**
 * The rulesets' cache, read through `withRulesetScope` (`services/rulesets/cow/`). It holds each ruleset's own rows,
 * a system ruleset's pinned (every fork reads them), which compose into a ruleset's view on each read, and each
 * ruleset's target paths. It reads committed rows only, through the shared `db`, never a transaction's: a change's
 * uncommitted rows would reach every reader. A change to a ruleset invalidates what it touched (`invalidate`).
 */
class RulesetCache {
  private readonly rawData = new DependentCache<RulesetRawData>();

  private readonly targetPaths = new DependentCache<TargetPathsAndLabels>();

  /** Whether a ruleset's own rows are pinned, kept whatever else the cache evicts. */
  isRawDataPinned(rulesetId: string, campaignId?: string): boolean {
    return this.rawData.isPinned(getRawDataKey(rulesetId, campaignId));
  }

  /** Drops what a change to a ruleset can touch: its copy-on-write data, its rows and its target paths. */
  invalidate(rulesetId: string): void {
    this.invalidateEntities(rulesetId);
    this.targetPaths.invalidate(rulesetId);
  }

  /** Drops everything the cache holds. */
  invalidateAll(): void {
    invalidateAllCowData();
    this.rawData.invalidateAll();
    this.targetPaths.invalidateAll();
  }

  /** Drops a ruleset's copy-on-write data and rows, for a change that leaves its target paths (a requirement's). */
  invalidateEntities(rulesetId: string): void {
    invalidateCowData(rulesetId);
    this.rawData.invalidate(rulesetId);
  }

  /** A ruleset's view: its own rows and its source chain's, composed by copy-on-write. */
  async getData(rulesetId: string, cowData: CachedCowData, campaignId?: string): Promise<CachedRulesetData> {
    const chain = await Promise.all([
      this.getRawData(rulesetId, campaignId),
      ...cowData.sourceChain.map((id) => this.getRawData(id)),
    ]);
    return buildRulesetData(chain, cowData);
  }

  /** A ruleset's own rows (a campaign's, with one), none of its ancestors': pinned when it's a system ruleset. */
  async getRawData(rulesetId: string, campaignId?: string): Promise<RulesetRawData> {
    return this.rawData.getOrFetch(getRawDataKey(rulesetId, campaignId), [rulesetId], () =>
      withCowContext(undefined, () => fetchRulesetRawData(rulesetId, campaignId)),
    );
  }

  /** A ruleset's target paths for a modifier or a requirement, and their segments' labels. */
  async getTargetPaths(
    rulesetId: string,
    kind: "modifier" | "requirement",
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
