import { Engine, type RulesetRawData } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Requirements, Rulesets, RulesetSettings } from "@/server/repositories/index.ts";

/**
 * A ruleset's own rows, none of its ancestors', which the cache keeps one entry of per ruleset
 * (`RulesetViews.getRawData`): its stored entities, every kind's, with their fields and links, its own settings, and
 * every customization of them, which the engine reads as its view's rows (`Engine.copyOnWrite().buildRawData`). Read
 * through the shared `db`, each read needing the ids the one before read.
 */
export default class RawDataReader {
  /** A ruleset's own rows, and whether the cache pins them: a system ruleset's, which every fork reads. */
  static async read(rulesetId: string): Promise<{ data: RulesetRawData; pinned: boolean }> {
    const [entities, tieredIds, ruleset] = await Promise.all([
      Entities.findStored(db, { rulesetId }),
      Entities.findTieredIds(db, { rulesetId }),
      Rulesets.findOne(db, { id: rulesetId }),
    ]);
    const ids = entities.map((entity) => entity.id);
    const [rulesets, modifiers] = await Promise.all([
      RulesetSettings.findMany(db, { ids: [rulesetId] }),
      Modifiers.findMany(db, { sourceIds: ids }),
    ]);
    // Requirements last: a modifier's are keyed on it
    const requirements = await Requirements.findMany(db, {
      entityIds: [...ids, ...modifiers.map((modifier) => modifier.id)],
    });
    const data = Engine.copyOnWrite().buildRawData({
      entities,
      tieredIds,
      modifiers,
      requirements,
      ruleset: rulesets[0],
    });
    // Pin a system ruleset's rows (a base's, an extension's) before writing them, so they're never evicted. `system`,
    // not a missing owner: an orphaned fork mustn't be pinned
    return { data, pinned: !!ruleset?.system };
  }
}
