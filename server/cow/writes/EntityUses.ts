import type { Db } from "@/drizzle/database.ts";
import type { CowData, RulesetSources } from "@/engine/index.ts";
import type { LockedRulesetScope } from "@/server/cow/views/scope.ts";
import { Entities, EntityLinks, EntityReferences, type ReferencedType } from "@/server/repositories/index.ts";

/**
 * What keeps a ruleset's entity in use, in its scope (`new EntityUses(scope)`, a write's, under its lock), across the rulesets
 * built on it: the guard of what would hard-delete one (an entity's delete, an owned entity's, a link's removal, an
 * entity a save removes). Its copy-on-write data gives it an entity's equivalents in the view: a pick stored before
 * the entity was copied names its source.
 */
export default class EntityUses {
  constructor(private readonly scope: LockedRulesetScope) {}

  /** The ruleset's copy-on-write data, as its view was read under the write's lock. */
  private get cow(): CowData {
    return this.scope.rulesetData.cow;
  }

  /** The ruleset and its sources. */
  private get ruleset(): RulesetSources {
    return this.scope.sources;
  }

  /**
   * Whether a character on the ruleset, or on a ruleset built on it (a fork of it, or a ruleset subscribing to it as an
   * extension), names the entity (`entityId`, of `entityType`) by any of its equivalents. An entity that owns others a
   * character names through them (a class by its levels).
   */
  async isPicked(tx: Db, entityType: ReferencedType, entityId: string): Promise<boolean> {
    const ids = await Entities.findPickedIds(tx, { entityType, ids: this.cow.getEquivalentIds(entityId) });
    return await EntityReferences.exists(tx, { ids, rulesetId: this.ruleset.id });
  }

  /**
   * Whether the entity (`entityId`, of `entityType`) is in use, which refuses its delete: linked to by a link of a
   * role that refuses its target's delete (a class level's base bonus to a save: the database would refuse it, this
   * answers why), or picked by a character (`isPicked`).
   */
  async refusesDelete(tx: Db, entityType: ReferencedType, entityId: string): Promise<boolean> {
    if (await EntityLinks.hasRefusing(tx, { toId: this.cow.resolve(entityId), toType: entityType })) return true;
    return await this.isPicked(tx, entityType, entityId);
  }
}
