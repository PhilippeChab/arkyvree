import type { Db } from "@/drizzle/database.ts";
import { Engine, type UnsettledKey } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/views/scope.ts";
import { Entities, Modifiers, NameBindings, Requirements } from "@/server/repositories/index.ts";

/** A stored row a rekey rewrites: its text, and the version a write it races checks. */
interface RekeyedRow {
  id: string;
  target: string | null;
  updatedAt: string;
  value: string | null;
}

/**
 * What a rekey did in a ruleset: how many rows' text it rewrote, how many group bindings' names it moved with them, how
 * many rows a write changed before it could (left for a run again), and the old keys several names now have keys for.
 */
interface RekeyResult {
  changedMeanwhile: number;
  groups: number;
  rewritten: number;
  unsettled: UnsettledKey[];
}

/**
 * The rekey of the rows saved before a name's key kept its accented Latin letters: in a ruleset, each of its own
 * modifiers and requirements, and each modifier set on its characters, has its text moved to the keys that keep them
 * (`skills.discrtion.misc` → `skills.discrétion.misc`), as the ruleset's view reads it (`LegacyKeys`). A segment bound
 * to an entity keeps its binding, which reads either key; a group's binding takes its text's new key. A row whose text
 * holds no old key is left as it is, so it runs again without harm.
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
    return { bindings, modifierIds: new Set(modifierIds), rows };
  }

  /** Rewrites the ruleset's rows saved under the old keys (`rulesetId`), in `tx`: what it did. */
  static async rekey(tx: Db, rulesetId: string): Promise<RekeyResult> {
    return await withRulesetScope(tx, rulesetId, async (scope) => {
      const { bindings, modifierIds, rows } = await NameRekey.readRows(tx, rulesetId);
      const plan = Engine.for(scope).planRekeyedNames(rows, bindings);
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
        groups: groups.length,
        rewritten: written.size,
        unsettled: plan.unsettled,
      };
    });
  }
}
