import type { Db } from "@/drizzle/database.ts";
import { type Aptitude, type CowData, Engine, type KlassLevel, type RulesetSources } from "@/engine/index.ts";
import { Entities, EntitySnapshots, RulesetEntities } from "@/server/repositories/index.ts";

/**
 * A ruleset's `CowData`: the rows the engine builds it from (`copyOnWrite().getReads`: the chain's snapshots, the levels
 * of the classes it copied or its own hide, its namesakes and aptitudes), read as stored through the handle it's given,
 * and the engine's build of them. The cache reads it through the shared `db` and keeps it for every reader
 * (`RulesetViews.getCowData`); a write reads it through its transaction, which sees the transaction's own copies
 * (`EntityCopy`, an unsubscribe's departing references), and keeps nothing.
 */
export default class CowDataReader {
  static async read(database: Db, ruleset: RulesetSources): Promise<CowData> {
    const reads = Engine.copyOnWrite().getReads(ruleset);
    const snapshots = await EntitySnapshots.findMany(database, { rulesetIds: reads.snapshotRulesetIds });
    const namesakes = await RulesetEntities.findNativeNames(database, reads.namesakes);
    const ownNamesakes = await RulesetEntities.findOwnNamesakes(database, reads.ownNamesakes);
    const klassLevels = await Entities.findMany<KlassLevel>(database, {
      entityType: "klass_levels",
      ownerIds: Engine.copyOnWrite().getPairedKlassIds({ ownNamesakes, snapshots }),
    });
    const aptitudes = await Entities.findMany<Aptitude>(database, {
      entityType: "aptitudes",
      rulesetIds: reads.aptitudeRulesetIds,
    });
    return Engine.copyOnWrite().buildData(ruleset, { aptitudes, klassLevels, namesakes, ownNamesakes, snapshots });
  }
}
