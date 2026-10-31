import type { Db } from "@/drizzle/database.ts";
import { EntitySnapshots, RulesetEntities, type RulesetEntityType } from "@/server/repositories/index.ts";

/** An entity a ruleset's changes name: its kind, its id and its name. */
interface ChangedEntity {
  entityType: RulesetEntityType;
  id: string;
  name: string;
}

/**
 * A ruleset's changes to what it inherits, as its snapshots and its own entities stand: what copy-on-write decides a
 * snapshot is. A copy of a live source is a change to it (`modified`, its source's id beside it); a source whose copy
 * was deleted (a tombstone) is deleted, and its restore shows it again (`deleted`); a copy whose source is gone (an
 * extension deleted it) is the ruleset's own entity, as one it made is (`added`); a snapshot whose copy and source are
 * both gone stands for nothing.
 */
export default class RulesetChanges {
  /** The ruleset's changes, by what each is. */
  static async read(db: Db, rulesetId: string) {
    const snapshots = await EntitySnapshots.findMany(db, { rulesetId });
    const local = await RulesetEntities.findNames(db, { rulesetId });
    const sources = await RulesetEntities.findNames(db, { ids: snapshots.map((snap) => snap.sourceEntityId) });
    const localById = new Map(local.map((row) => [row.id, row]));
    const sourceById = new Map(sources.map((row) => [row.id, row]));
    const of = ({ entityType, id, name }: ChangedEntity) => ({ entityType, id, name });

    const modified: (ChangedEntity & { sourceEntityId: string })[] = [];
    const deleted: (ChangedEntity & { sourceEntityId: string })[] = [];
    const copiedIds = new Set<string>();
    for (const snap of snapshots) {
      const copy = localById.get(snap.forkedEntityId);
      const source = sourceById.get(snap.sourceEntityId);
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
