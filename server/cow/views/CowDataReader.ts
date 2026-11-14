import type { Db } from "@/drizzle/database.ts";
import { type CowData, type CowRows, Engine, type RulesetSources } from "@/engine/index.ts";
import { Entities, EntitySnapshots, RulesetEntities } from "@/server/repositories/index.ts";

/**
 * A ruleset's `CowData`: the rows the engine builds it from (`Engine.forRules(baseRules).copyOnWrite().getReads`: the
 * chain's snapshots, the owned entities of the owners it copied or its own hide, its namesakes, and the entities of the
 * kinds a name is the identity of), read as stored through the handle it's given, and the engine's build of them. The
 * cache reads it through the shared `db` and keeps it for every reader (`RulesetViews.getCowData`); a write reads it
 * through its transaction, which sees the transaction's own copies (`EntityCopy`, an unsubscribe's departing
 * references), and keeps nothing. The copies whose name or description differs from what they copied come with what
 * they changed (`EntitySnapshots.findTexts`), which a view merges into their winners'.
 */
export default class CowDataReader {
  /**
   * A ruleset's (`ruleset`, its sources), its kinds paired by its base rules' module's declarations. With `changes`, as
   * it reads once the ruleset's copies they name (each by its id) are gone (`dropped`), or copy the entities given
   * instead (`rebased`): an unsubscribe's, whose copies of an extension's entities go, or stay copies of what stands in
   * their place.
   */
  static async read(
    database: Db,
    ruleset: RulesetSources,
    changes: { dropped?: ReadonlySet<string>; rebased?: ReadonlyMap<string, string> } = {},
  ): Promise<CowData> {
    const { dropped = new Set(), rebased = new Map() } = changes;
    const copyOnWrite = Engine.forRules(ruleset.baseRules).copyOnWrite();
    const reads = copyOnWrite.getReads(ruleset);
    const own = (snap: { forkedEntityId: string; rulesetId: string }) => snap.rulesetId === ruleset.id;
    const snapshots = (await EntitySnapshots.findMany(database, { rulesetIds: reads.snapshotRulesetIds }))
      .filter((snap) => !own(snap) || !dropped.has(snap.forkedEntityId))
      .map((snap) =>
        own(snap) && rebased.has(snap.forkedEntityId)
          ? { ...snap, sourceEntityId: rebased.get(snap.forkedEntityId)! }
          : snap,
      );
    const texts = await EntitySnapshots.findTexts(database, { rulesetIds: reads.snapshotRulesetIds });
    const namesakes = await RulesetEntities.findNativeNames(database, reads.namesakes);
    const ownNamesakes = (await RulesetEntities.findOwnNamesakes(database, reads.ownNamesakes)).filter(
      (row) => !dropped.has(row.id),
    );
    const ownerIds = copyOnWrite.getPairedOwnerIds({ ownNamesakes, snapshots });
    const owned: CowRows["owned"] = [];
    for (const entityType of reads.owned.entityTypes) {
      const positions = await Entities.findPositions(database, { entityType, ownerIds });
      owned.push(...positions.map((position) => ({ entityType, ...position })));
    }
    const identities: CowRows["identities"] = [];
    for (const entityType of reads.identities.entityTypes) {
      const where = { entityType, rulesetIds: reads.identities.rulesetIds };
      const rows = await Entities.findMany(database, where);
      identities.push(...rows.map(({ id, name, rulesetId }) => ({ entityType, id, name: name ?? "", rulesetId })));
    }
    return copyOnWrite.buildData(ruleset, { identities, namesakes, owned, ownNamesakes, snapshots, texts });
  }
}
