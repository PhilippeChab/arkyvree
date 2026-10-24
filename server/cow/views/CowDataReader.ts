import type { Db } from "@/drizzle/database.ts";
import { type CowData, type CowRows, Engine, type RulesetSources } from "@/engine/index.ts";
import { Entities, type EntityRow, EntitySnapshots, RulesetEntities } from "@/server/repositories/index.ts";

/**
 * A ruleset's `CowData`: the rows the engine builds it from (`copyOnWrite().getReads`: the chain's snapshots, the owned
 * entities of the owners it copied or its own hide, its namesakes, and the entities of the kinds a name is the identity
 * of), read as stored through the handle it's given, and the engine's build of them. The cache reads it through the
 * shared `db` and keeps it for every reader (`RulesetViews.getCowData`); a write reads it through its transaction, which
 * sees the transaction's own copies (`EntityCopy`, an unsubscribe's departing references), and keeps nothing.
 */
export default class CowDataReader {
  static async read(database: Db, ruleset: RulesetSources): Promise<CowData> {
    const storage = Engine.storage();
    const reads = Engine.copyOnWrite().getReads(ruleset);
    const snapshots = await EntitySnapshots.findMany(database, { rulesetIds: reads.snapshotRulesetIds });
    const namesakes = await RulesetEntities.findNativeNames(database, reads.namesakes);
    const ownNamesakes = await RulesetEntities.findOwnNamesakes(database, reads.ownNamesakes);
    const ownerIds = Engine.copyOnWrite().getPairedOwnerIds({ ownNamesakes, snapshots });
    const owned: CowRows["owned"] = [];
    for (const entityType of storage.ownedTypes())
      owned.push(...storage.ownedPositionsOf(entityType, await Entities.findMany(database, { entityType, ownerIds })));
    const identities: CowRows["identities"] = [];
    for (const entityType of reads.identities.entityTypes) {
      const where = { entityType, rulesetIds: reads.identities.rulesetIds };
      const rows = await Entities.findMany<EntityRow & { name: string; rulesetId: string }>(database, where);
      identities.push(...rows.map(({ id, name, rulesetId }) => ({ entityType, id, name, rulesetId })));
    }
    return Engine.copyOnWrite().buildData(ruleset, { identities, namesakes, owned, ownNamesakes, snapshots });
  }
}
