import { buildCowData, type CowData, getCowReads, getPairedKlassIds, type RulesetSources } from "@/engine/index.ts";
import { type Db, withCowContext } from "@/server/database/index.ts";
import { Aptitudes, EntitySnapshots, KlassLevels, RulesetEntities } from "@/server/repositories/index.ts";

/**
 * A ruleset's `CowData`, from the rows it's built from (`getCowReads`), read through `database`: the shared `db` for its
 * scope's, which the cache shares with every reader (`RulesetCache.getCowData`), or a copy's transaction for the
 * copy's, which sees the transaction's own copies (`EntityCopy`). It reads stored ids, copy-on-write resolution off.
 */
export async function readCowData(database: Db, ruleset: RulesetSources): Promise<CowData> {
  return await withCowContext(undefined, async () => {
    const reads = getCowReads(ruleset);
    const snapshots = await EntitySnapshots.findMany(database, { rulesetIds: reads.snapshotRulesetIds });
    const namesakes = await RulesetEntities.findNativeNames(database, reads.namesakes);
    const klassLevels = await KlassLevels.findMany(database, { klassIds: getPairedKlassIds(ruleset.id, snapshots) });
    const aptitudes = await Aptitudes.findMany(database, { rulesetIds: reads.aptitudeRulesetIds });
    return buildCowData(ruleset, { aptitudes, klassLevels, namesakes, snapshots });
  });
}
