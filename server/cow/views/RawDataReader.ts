import { Engine, type RulesetRawData } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Fields, Modifiers, Requirements, Rulesets } from "@/server/repositories/index.ts";

/**
 * A ruleset's own rows (a campaign's, with one), none of its ancestors', which the cache keeps one entry of per ruleset
 * (`RulesetViews.getRawData`): its stored entities, every kind's, with their fields and links, the entities their lists
 * name, its own settings, and every customization of them, which the engine reads as its view's rows
 * (`Engine.copyOnWrite().buildRawData`). Read through the shared `db`, each read needing the ids the one before read.
 */
export default class RawDataReader {
  /** A ruleset's own rows, and whether the cache pins them: a system ruleset's, which every fork reads. */
  static async read(rulesetId: string, campaignId?: string): Promise<{ data: RulesetRawData; pinned: boolean }> {
    const scope = campaignId ? { rulesetId, campaignId } : { rulesetId };
    const [entities, tieredIds, ruleset] = await Promise.all([
      Entities.findStored(db, scope),
      Entities.findTieredIds(db, scope),
      campaignId ? Promise.resolve(null) : Rulesets.findOne(db, { id: rulesetId }),
    ]);
    // An owned entity whose owner is archived isn't the ruleset's: a class's levels go with it
    const held = new Set(entities.map((entity) => entity.id));
    const ids = entities
      .filter((entity) => entity.ownerId === null || held.has(entity.ownerId))
      .map((entity) => entity.id);
    const [targets, rulesets, modifiers] = await Promise.all([
      Entities.findStored(db, { ids: Engine.storage().listTargetIds(entities) }),
      Fields.findRulesets(db, { ids: [rulesetId] }),
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
      targets,
    });
    // Pin a system ruleset's rows (a base's, an extension's) before writing them, so they're never evicted. `system`,
    // not a missing owner: an orphaned fork mustn't be pinned. A campaign's entry never is.
    return { data, pinned: !!ruleset?.system };
  }
}
