import type { BaseClassSeeds } from "@/codegen/dnd3.5/tools/seeds/classes/BaseClassSeeds.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { grantLanguage, languagePick } from "@/content/dnd3.5/builders/languages/knowledge.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A table cell's number: "+10 ft." is 10, "−2" (a typographic minus) is -2, a dash none. */
function cellNumber(cell: string) {
  return Number(cell.replace("\u2212", "-").match(/[+-]?\d+/)?.[0] ?? 0);
}

/**
 * A class's level modifiers: its overrides', those its table's columns give, as its mapping names them, and its
 * languages'.
 */
export function LevelModifiers<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithLevelModifiers extends Base {
    /**
     * The class's level modifiers: its overrides', then those its table's columns give (`mapping.columns`, an
     * override's), at each level a column's value changes: a number's rise, or its text; then its languages'
     * (`mapping.languages`): the grant of each language its members speak, at its first level (a druid's Druidic), and
     * one more language to pick at each level that adds one (a loremaster's 4th and 8th).
     */
    protected levelModifiers(): (ModifierSeed & { level: number })[] {
      const fromColumns = Object.entries(this.ref.mapping.columns ?? {}).flatMap(
        ([column, { target, operator, requirements }]) => {
          if (!this.ref.raw.progression.some((row) => row.columns?.[column] !== undefined))
            throw new Error(`${this.ref.raw.name}: its table has no "${column}" column`);

          let previous = operator === "add" ? "+0" : "";
          return this.ref.raw.progression.flatMap((row) => {
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
      const { automatic = [], levels = [] } = this.ref.mapping.languages ?? {};
      const languages = [
        ...automatic.map((name) => ({ level: 1, ...grantLanguage(name) })),
        ...levels.map((level) => ({ level, ...languagePick() })),
      ];
      return [...(this.ref.mapping.modifiers ?? []), ...fromColumns, ...languages];
    }
  }
  return WithLevelModifiers;
}
