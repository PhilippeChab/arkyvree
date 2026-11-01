import type { Db } from "@/drizzle/database.ts";
import { EntitySnapshots, RulesetEntities, type RulesetEntityType } from "@/server/repositories/index.ts";

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
 * both gone stands for nothing. A source's ruleset says whose entity the ruleset copied (`copiesOf`: an extension's,
 * which its unsubscribe reverts).
 */
export default class RulesetChanges {
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
        modified.push({ ...of(copy), sourceEntityId: source.id });
      } else if (source) {
        deleted.push({ ...of(source), sourceEntityId: source.id });
      }
    }
    const added = local.filter((row) => !copiedIds.has(row.id)).map(of);
    return { added, deleted, modified };
  }
}
