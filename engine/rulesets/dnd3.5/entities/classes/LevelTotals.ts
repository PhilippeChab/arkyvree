/**
 * What a class's levels' modifiers add up to by each level, by the key each counts toward: its table's feat pools,
 * spells per day and spells known, as its page shows them and its progression's save plans them.
 */

import type { TableModifier, TableStep } from "@/engine/core/entities/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";

/**
 * The steps a class's tables take of its levels' modifiers, which the core adds up by each level
 * (`ProgressionColumns.computeRunning`): its spells known's and its spells per day's.
 */
export default class LevelTotals {
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
