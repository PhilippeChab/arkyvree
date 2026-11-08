/**
 * What a class's levels' modifiers add up to by each level, by the key each counts toward: its table's feat pools, its
 * spell slots, and its cantrips and known spells, as its page shows them and its progression's save plans them.
 */

import type { TableModifier, TableStep } from "@/engine/core/entities/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import AptitudeTargets from "@/engine/rulesets/dnd5/model/aptitudes/AptitudeTargets.ts";

/** What the Pact Magic table counts by a level, a column each: its slots, and their level. */
export const PACT_KEYS = ["slots", "level"] as const;

/**
 * The steps a class's spell tables take of its levels' modifiers, which the core adds up by each level
 * (`ProgressionColumns.computeRunning`): its cantrips' and known spells', its spell slots', and its Pact Magic's.
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
   * A modifier's step on the Pact Magic, by what it counts (`slots`, `level`): `spellcasting.pact.slots` and
   * `spellcasting.pact.level` add to them, as a warlock's levels do.
   */
  static readPactStep(modifier: TableModifier): TableStep<number> | undefined {
    const key = PACT_KEYS.find((column) => modifier.target === `spellcasting.pact.${column}`);
    const value = LiteralValue.parse(modifier.value, "number");
    if (key === undefined || modifier.operator !== "add" || typeof value !== "number") return undefined;
    return { key, step: (total) => (total ?? 0) + value };
  }

  /** A modifier's step on the spell slots by spell level: a list's spell level's `uses` adds to them. */
  static readSlotStep(modifier: TableModifier): TableStep<number> | undefined {
    const target = AptitudeTargets.parseSpellLevel(modifier.target);
    const value = LiteralValue.parse(modifier.value, "number");
    if (target?.field !== "uses" || typeof value !== "number") return undefined;
    return { key: target.level, step: (total) => (total ?? 0) + value };
  }
}
