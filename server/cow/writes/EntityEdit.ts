import type { Db } from "@/drizzle/database.ts";
import type { RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities, type RulesetEntityType } from "@/server/repositories/index.ts";

import EntityCopy from "./EntityCopy.ts";

/**
 * The row an edit or a delete of a ruleset's entity writes (`new EntityEdit(ruleset)`): the ruleset's own entity, or the
 * copy of an inherited one, made on its first edit (`EntityCopy`). Every method takes the transaction.
 */
export default class EntityEdit {
  constructor(private readonly ruleset: RulesetSources) {}

  /** Locks an entity a change writes under (its customizations, its delete), by its stored id: a not found when gone. */
  static async lock(tx: Db, entityId: string): Promise<void> {
    if (!(await Entities.lock(tx, { id: entityId })))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }

  /**
   * The row a delete of `entity` removes: as `cowToEdit`, and the ruleset's own entity is locked first, so its
   * customizations' writes wait for the delete.
   */
  async cowToDelete(tx: Db, entityType: RulesetEntityType, entity: { id: string; rulesetId: string }): Promise<string> {
    const target = await this.cowToEdit(tx, entityType, entity);
    if (!target.copied) await EntityEdit.lock(tx, target.id);
    return target.id;
  }

  /**
   * The row an edit of `entity` (as the engine found it in the view) writes: the ruleset's own entity, or the copy of an
   * inherited one, made on its first edit, with the customizations it copied, by their source's id (`copiedIds`). A
   * copy takes no stale-edit check: the client's `updatedAt` is the source's.
   */
  async cowToEdit(
    tx: Db,
    entityType: RulesetEntityType,
    entity: { id: string; rulesetId: string },
  ): Promise<{ copied: boolean; copiedIds: ReadonlyMap<string, string>; id: string }> {
    if (entity.rulesetId === this.ruleset.id) return { id: entity.id, copied: false, copiedIds: new Map() };
    const copy = await EntityCopy.create(tx, entityType, entity.id, this.ruleset);
    return { id: copy.entity.id, copied: true, copiedIds: copy.copiedIds };
  }
}
