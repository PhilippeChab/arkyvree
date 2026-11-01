import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { EntitySnapshots, RulesetEntities, type RulesetEntityType } from "@/server/repositories/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import type { RulesetScope } from "./scope.ts";

/** An entity a ruleset's changes name: its kind, its id and its name. */
interface ChangedEntity {
  entityType: RulesetEntityType;
  id: string;
  name: string;
}

/** An entity as the name queries read it: a changed entity, with the ruleset that holds it. */
type NamedEntity = ChangedEntity & { rulesetId: string };

/**
 * A ruleset's changes to what it inherits, as its snapshots and its own entities stand: what copy-on-write decides a
 * snapshot is. A copy of a live source is a change to it (`modified`, its source's id beside it); a source whose copy
 * was deleted (a tombstone) is deleted, and its restore shows it again (`deleted`); a copy whose source is gone (an
 * extension deleted it) is the ruleset's own entity, as one it made is (`added`); a snapshot whose copy and source are
 * both gone stands for nothing. A change it lists is of a kind a restore brings back (`restorableKinds`: no route
 * edits a read-only one, 3.5's abilities). A source's ruleset says whose entity the ruleset copied (`copiesOf`: an
 * extension's, which its unsubscribe reverts).
 */
export default class RulesetChanges {
  /** Whether a restore brings back an entity of the kind (`entityType`): one a route writes (`restorableKinds`). */
  private static isRestorable(entityType: string) {
    return isOneOf(entityType, Engine.rules().restorableKinds());
  }

  /** The ruleset's snapshots, each with its source, if it's still there. */
  private static async readSources(db: Db, rulesetId: string) {
    const snapshots = await EntitySnapshots.findMany(db, { rulesetId });
    const sources: NamedEntity[] = await RulesetEntities.findNames(db, {
      ids: snapshots.map((snap) => snap.sourceEntityId),
    });
    const sourceById = new Map(sources.map((row) => [row.id, row]));
    return snapshots.map((snap) => ({
      forkedEntityId: snap.forkedEntityId,
      source: sourceById.get(snap.sourceEntityId),
    }));
  }

  /**
   * The ruleset's copies of `sourceRulesetId`'s entities (an extension's): each snapshot whose source the extension
   * holds, a change to it or a tombstone of it, with its source's type and id and its copy's id. A copy whose source is
   * gone is the ruleset's own, of no extension's.
   */
  static async copiesOf(db: Db, rulesetId: string, sourceRulesetId: string) {
    const snapshots = await RulesetChanges.readSources(db, rulesetId);
    return snapshots.flatMap(({ forkedEntityId, source }) =>
      source?.rulesetId === sourceRulesetId
        ? [{ entityType: source.entityType, forkedEntityId, sourceEntityId: source.id }]
        : [],
    );
  }

  /** The ruleset's changes, by what each is. */
  static async read(db: Db, rulesetId: string) {
    const snapshots = await RulesetChanges.readSources(db, rulesetId);
    const local: NamedEntity[] = await RulesetEntities.findNames(db, { rulesetId });
    const localById = new Map(local.map((row) => [row.id, row]));
    const of = ({ entityType, id, name }: ChangedEntity) => ({ entityType, id, name });

    const modified: (ChangedEntity & { sourceEntityId: string })[] = [];
    const deleted: (ChangedEntity & { sourceEntityId: string })[] = [];
    const copiedIds = new Set<string>();
    for (const { forkedEntityId, source } of snapshots) {
      const copy = localById.get(forkedEntityId);
      if (copy && source) {
        copiedIds.add(copy.id);
        if (RulesetChanges.isRestorable(copy.entityType)) modified.push({ ...of(copy), sourceEntityId: source.id });
      } else if (source && RulesetChanges.isRestorable(source.entityType)) {
        deleted.push({ ...of(source), sourceEntityId: source.id });
      }
    }
    const added = local.filter((row) => !copiedIds.has(row.id)).map(of);
    return { added, deleted, modified };
  }

  /**
   * Whether deleting an entity the ruleset's view shows (`entity`, of `entityType`) leaves a change its Local Changes
   * restore (`read`), which brings the entity back with what it holds: of a fork, of a kind a restore takes
   * (`restorableKinds`), an inherited entity (its delete leaves a tombstone of it), or the fork's copy of a source
   * still there (a change to it, its delete a tombstone). The fork's own entity, a copy whose source is gone among
   * them, is gone for good, as is everything of a ruleset without a parent.
   */
  static async restoresDelete(
    db: Db,
    { ruleset, rulesetData }: Pick<RulesetScope, "ruleset" | "rulesetData">,
    entityType: string,
    entity: { id: string; rulesetId: string },
  ) {
    if (!ruleset.rulesetId || !RulesetChanges.isRestorable(entityType)) return false;
    if (entity.rulesetId !== ruleset.id) return true;
    const sourceId = rulesetData.cow.sourceOf(entity.id);
    if (!sourceId) return false;
    return (await RulesetEntities.findNames(db, { ids: [sourceId] })).length > 0;
  }
}
