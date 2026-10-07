/** A class's level modifiers: its overrides', and those its table's columns give. */

import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { ModifierSeed } from "@/database/packages/dnd35/content/customization/types.ts";

/** A table cell's number: "+10 ft." is 10, "−2" (a typographic minus) is -2, a dash none. */
function cellNumber(cell: string) {
  return Number(cell.replace("\u2212", "-").match(/[+-]?\d+/)?.[0] ?? 0);
}

/**
 * A class's level modifiers: its overrides', then those its table's columns give (`overrides.columns`), at each level a
 * column's value changes: a number's rise, or its text.
 */
export function buildClassModifiers(ref: ClassReference): (ModifierSeed & { level: number })[] {
  const fromColumns = Object.entries(ref.overrides?.columns ?? {}).flatMap(
    ([column, { target, operator, requirements }]) => {
      if (!ref.raw.progression.some((row) => row.columns?.[column] !== undefined))
        throw new Error(`${ref.raw.name}: its table has no "${column}" column`);

      let previous = operator === "add" ? "+0" : "";
      return ref.raw.progression.flatMap((row) => {
        // A blank cell keeps the value above it
        const cell = row.columns?.[column] || previous;
        const rise = cellNumber(cell) - cellNumber(previous);
        const changed = operator === "add" ? rise !== 0 : cell !== previous;
        previous = cell;
        if (!changed) return [];
        const value = operator === "add" ? String(rise) : cell;
        const valueType = operator === "add" ? "number" : "string";
        return [{ level: row.level, target, value, valueType, operator, ...(requirements && { requirements }) }];
      });
    },
  );
  return [...(ref.overrides?.modifiers ?? []), ...fromColumns];
}
