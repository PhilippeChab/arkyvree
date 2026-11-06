/**
 * What a class's levels' modifiers add up to by each level, by the key each counts toward: its table's feat pools, and
 * its cantrips and prepared spells, as its page shows them and its progression's save plans them.
 */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import AptitudeTargets from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudeTargets.ts";

/** A level's modifier as a table reads it: the level it's on (`sourceId`), its target, its operator and its value. */
export interface TableModifier {
  operator: string;
  sourceId: string;
  target: string;
  value: string;
}

/** What a level's modifier steps on its table: the key it counts toward, and that key's total after it. */
export interface TableStep<V> {
  key: string | number;
  step: (total: V | undefined) => V;
}

/**
 * What a class's levels' modifiers add up to by each level (`computeRunning`), and the step its spell table takes of
 * them: its cantrips' and prepared spells'.
 */
export default class LevelTotals {
  /**
   * Each level's running totals by key, by its id: each of its modifiers (`modifiers`, by their `sourceId`, its level)
   * steps the total of the key it counts toward (`stepOf`; none counts toward no key), over the levels by their number.
   */
  static computeRunning<V>(
    levels: { id: string; position: number }[],
    modifiers: TableModifier[],
    stepOf: (modifier: TableModifier) => TableStep<V> | undefined,
  ): Map<string, Record<string | number, V>> {
    const stepsByLevelId = Map.groupBy(
      modifiers.flatMap((modifier) => {
        const step = stepOf(modifier);
        return step ? [{ ...step, levelId: modifier.sourceId }] : [];
      }),
      (step) => step.levelId,
    );
    const totals: Record<string | number, V> = {};
    const totalsByLevelId = new Map<string, Record<string | number, V>>();
    for (const level of levels.toSorted((a, b) => a.position - b.position)) {
      for (const { key, step } of stepsByLevelId.get(level.id) ?? []) totals[key] = step(totals[key]);
      totalsByLevelId.set(level.id, { ...totals });
    }
    return totalsByLevelId;
  }

  /**
   * A modifier's step on the spells known by spell level: a list's spell level's `allowed` adds to it, and "All", every
   * spell of its list, once a level sets it so (`AptitudeTargets.setsAllKnown`).
   */
  static readKnownStep(modifier: TableModifier): TableStep<number | "All"> | undefined {
    const target = AptitudeTargets.parseSpellLevel(modifier.target);
    const value = LiteralValue.parse(modifier.value, "number");
    if (target?.field !== "allowed" || typeof value !== "number") return undefined;
    const setsAll = AptitudeTargets.setsAllKnown(modifier);
    return { key: target.level, step: (total) => (setsAll || total === "All" ? "All" : (total ?? 0) + value) };
  }
}
