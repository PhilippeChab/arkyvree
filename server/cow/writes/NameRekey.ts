import type { Db } from "@/drizzle/database.ts";
import { Engine, type KeyClash, type UnsettledKey } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/views/scope.ts";
import { Entities, Locks, Modifiers, NameBindings, Requirements } from "@/server/repositories/index.ts";

/** A stored row a rekey rewrites: its text, and the version a write it races checks. */
interface RekeyedRow {
  id: string;
  target: string | null;
  updatedAt: string;
  value: string | null;
}

/**
 * What a rekey did in a ruleset: how many rows' text it rewrote, how many group bindings' names it moved with them, how
 * many rows a write changed before it could (left for a run again), the old keys it left, and the names the new keys
 * read as one.
 */
interface RekeyResult {
  changedMeanwhile: number;
  clashes: KeyClash[];
  groups: number;
  rewritten: number;
  unsettled: UnsettledKey[];
}

/**
 * The rekey of the rows saved while a name's key left its accented Latin letters out: in a ruleset, each of its own
 * modifiers and requirements, and each modifier set on its characters, has its text moved to the keys that read them
 * as plain letters (`skills.discrtion.misc` → `skills.discretion.misc`), as the ruleset's view reads it (`LegacyKeys`).
 * A segment bound to an entity keeps its binding, which reads either key; a group's binding takes its text's new key.
 * An old key it can't move to one name's key alone is left, and listed. A row whose text holds no old key is left as it
 * is, so it runs again without harm.
 */
export default class NameRekey {
  /** The ruleset's own rows that carry paths, and the modifiers set on its characters: ids by kind, and their text. */
  private static async readRows(tx: Db, rulesetId: string) {
    const entities = await Entities.findStored(tx, { rulesetId });
    const modifiers = await Modifiers.findMany(tx, { sourceIds: entities.map((entity) => entity.id) });
    const requirements = await Requirements.findMany(tx, {
      entityIds: [...entities.map((entity) => entity.id), ...modifiers.map((modifier) => modifier.id)],
    });
    const set = await NameBindings.findOfCharacters(tx, { rulesetId });
    const modifierIds = [...modifiers, ...set].map((modifier) => modifier.id);
    const bindings = await NameBindings.findMany(tx, {
      modifierIds,
      requirementIds: requirements.map((requirement) => requirement.id),
    });
    const rows: RekeyedRow[] = [...modifiers, ...set, ...requirements];
    // Each character's modifier's character, and its master's: a bonded creature's write touches its master
    const charactersOf = new Map(
      set.map(({ id, parentCharacterId, sourceId }) => [
        id,
        parentCharacterId ? [parentCharacterId, sourceId] : [sourceId],
      ]),
    );
    return { bindings, charactersOf, modifierIds: new Set(modifierIds), rows };
  }

  /**
   * Rewrites the ruleset's rows saved under the old keys (`rulesetId`), in `tx`: what it did. It locks as every write
   * does (`Locks`), the ruleset before anything else, then the characters whose own modifiers it rewrites and their
   * masters (a bonded creature's modifier written touches its master), masters first, then their rows, so a save
   * beside it waits its turn rather than deadlock.
   */
  static async rekey(tx: Db, rulesetId: string): Promise<RekeyResult> {
    await Locks.lockRulesets(tx, { ids: [rulesetId] }, "update");
    return await withRulesetScope(tx, rulesetId, async (scope) => {
      const { bindings, charactersOf, modifierIds, rows } = await NameRekey.readRows(tx, rulesetId);
      const plan = Engine.for(scope).planRekeyedNames(rows, bindings);
      // Masters before their children, as `Locks` orders them
      const characterIds = [...plan.rows.keys()].flatMap((id) => charactersOf.get(id) ?? []);
      await Locks.lockCharacters(tx, { ids: [...new Set(characterIds)] }, "no key update");
      const written = new Set<string>();
      for (const row of rows) {
        const text = plan.rows.get(row.id);
        if (!text) continue;
        // Past a write that changed the row since it was read, which a run again reads anew
        const where = { id: row.id, updatedAt: row.updatedAt };
        const updated = modifierIds.has(row.id)
          ? await Modifiers.backfillText(tx, { target: text.target!, value: text.value! }, where)
          : await Requirements.backfillText(tx, text, where);
        if (updated.length > 0) written.add(row.id);
      }
      const groups = bindings.filter(
        (binding) => plan.groups.has(binding.id) && written.has((binding.modifierId ?? binding.requirementId)!),
      );
      for (const group of groups) await NameBindings.update(tx, { name: plan.groups.get(group.id)! }, { id: group.id });
      return {
        changedMeanwhile: plan.rows.size - written.size,
        clashes: plan.clashes,
        groups: groups.length,
        rewritten: written.size,
        unsettled: plan.unsettled,
      };
    });
  }
}
