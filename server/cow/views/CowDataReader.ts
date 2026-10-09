import { type CowData, Engine, type RulesetSources } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Aptitudes, EntitySnapshots, KlassLevels, RulesetEntities } from "@/server/repositories/index.ts";

/**
 * A ruleset's `CowData`: the rows the engine builds it from (`copyOnWrite().getReads`: the chain's snapshots, the levels
 * of the classes it copied, its namesakes and aptitudes), read as stored through the handle it's given, and the
 * engine's build of them. The cache reads it through the shared `db` and keeps it for every reader
 * (`RulesetViews.getCowData`); a write reads it through its transaction, which sees the transaction's own copies
 * (`EntityCopy`, an unsubscribe's departing references), and keeps nothing.
 */
export default class CowDataReader {
  static async read(database: Db, ruleset: RulesetSources): Promise<CowData> {
    const reads = Engine.copyOnWrite().getReads(ruleset);
    const snapshots = await EntitySnapshots.findMany(database, { rulesetIds: reads.snapshotRulesetIds });
    const namesakes = await RulesetEntities.findNativeNames(database, reads.namesakes);
    const klassLevels = await KlassLevels.findMany(database, {
      klassIds: Engine.copyOnWrite().getPairedKlassIds(ruleset.id, snapshots),
    });
    const aptitudes = await Aptitudes.findMany(database, { rulesetIds: reads.aptitudeRulesetIds });
    return Engine.copyOnWrite().buildData(ruleset, { aptitudes, klassLevels, namesakes, snapshots });
  }
}
