/**
 * What a class's levels' modifiers add up to by each level, by the key each counts toward: its table's feat pools,
 * spells per day and spells known, as its page shows them and its progression's save plans them.
 */

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";

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
 * What a class's levels' modifiers add up to by each level (`computeRunning`), and the steps its tables take of them:
 * its spells known's and its spells per day's.
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

  /**
   * A modifier's step on the spells per day by spell level: a list's spell level's `uses` adds to it, and the level its
   * `allowed` opens it at counts 0 until uses come (some spells or all of them, as the sheet's bonus spells read it), as
   * the SRD's tables write a spell level its bonus spells alone fill.
   */
  static readPerDayStep(modifier: TableModifier): TableStep<number> | undefined {
    const target = AptitudeTargets.parseSpellLevel(modifier.target);
    const value = LiteralValue.parse(modifier.value, "number");
    if (!target || typeof value !== "number") return undefined;
    if (target.field === "uses") return { key: target.level, step: (total) => (total ?? 0) + value };
    return value === 0 ? undefined : { key: target.level, step: (total) => total ?? 0 };
  }
}
