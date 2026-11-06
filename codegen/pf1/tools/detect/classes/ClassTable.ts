import type { ClassEntry } from "@/codegen/pf1/tools/types/classes.ts";
import type { PageTable } from "@/codegen/pf1/tools/types/pages.ts";
import type { CasterLevelAdvancement } from "@/content/pf1/builders/classes/types.ts";
import { Engine } from "@/engine/index.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import type { BabType, SaveType } from "@/vocabulary/pf1/classes.ts";

import { splitList } from "./lists.ts";

/** A class's spells per day, a row per class level, each its spell levels' slots from its first. */
export interface SpellsPerDay {
  /** Whether its first spell level is the cantrips' (its table's "Spells Per Day 0"). */
  cantrips: boolean;
  /** Whether its slots give a domain spell slot more ("1+1"): a cleric's. */
  domainSlots: boolean;
  rows: number[][];
}

/** A table's cell that holds nothing: a dash, or none. */
const EMPTY_CELL = /^[-–—]?$/;

/** Pathfinder's progressions' values at each class level, by how good each is: what a table's columns are read against. */
const LEVEL_PRESETS = Engine.forRules(PF1_BASE_RULES).describeLevelPresets();

/** The column holding a prestige class's spellcasting: the levels it adds to another class's ("+1 level of…"). */
const SPELLS_PER_DAY = "Spells Per Day";

/** A bonus as a table writes it, its first: "+6/+1" → 6, "+0" → 0. */
function bonusOf(cell: string): number {
  return parseInt(cell.replace("–", "-"), 10);
}

/** The values of a row's cells read as slots, up to its first empty one: "1+1" is one slot (and a domain slot). */
function slotsOf(cells: string[]): number[] {
  const end = cells.findIndex((cell) => EMPTY_CELL.test(cell.trim()));
  return cells.slice(0, end < 0 ? cells.length : end).map((cell) => parseInt(cell, 10));
}

/**
 * A class's tables, read: its progression's (its base attack bonus, saves, the features its Special column names, its
 * spells per day or the caster levels it adds to another class, and its other columns: a monk's unarmed damage) and its
 * spells known. Its progressions are the engine's presets its values follow at every level, a prestige class's saves
 * their own; a column none follows is refused.
 */
export class ClassTable {
  constructor(entry: Pick<ClassEntry, "name" | "tables">) {
    const progression = entry.tables.find(
      ({ columns }) => columns[0] === "Level" && columns.includes("Base Attack Bonus"),
    );
    if (!progression) throw new Error(`${entry.name}'s page has no progression table`);
    this.name = entry.name;
    this.progression = progression;
    this.known = entry.tables.find(({ columns }) => columns[0] === "Level" && columns[1] === "0");
  }

  /** Its spells known table: a spontaneous caster's. */
  private readonly known: PageTable | undefined;
  /** The class's name, which a refusal names. */
  private readonly name: string;
  /** Its progression table. */
  private readonly progression: PageTable;

  /** The save of column `name`'s progression: the engine's preset its values follow (a prestige class's has its own). */
  private saveProgression(name: string): SaveType {
    const values = this.values(name, bonusOf);
    const preset = (Object.keys(LEVEL_PRESETS.saves) as SaveType[]).find((key) =>
      values.every((value, i) => LEVEL_PRESETS.saves[key][i] === value),
    );
    if (!preset) throw new Error(`${this.name}'s ${name} column (${values.join(", ")}) follows no save progression`);
    return preset;
  }

  /**
   * The values of its progression's column `name` read by `read`, a level each. A column it lacks, or one without a
   * cell at each of its levels, throws: none would follow every progression, and seed the first.
   */
  private values(name: string, read: (cell: string) => number): number[] {
    const cells = this.column(name);
    if (!cells) throw new Error(`${this.name}'s progression table has no "${name}" column`);
    if (cells.length !== this.levels() || this.levels() === 0)
      throw new Error(`${this.name}'s "${name}" column has ${cells.length} cells for ${this.levels()} levels`);
    return cells.map(read);
  }

  /** Its base attack bonus's progression: the engine's preset its values follow. */
  bab(): BabType {
    const values = this.values("Base Attack Bonus", bonusOf);
    const bab = (Object.keys(LEVEL_PRESETS.bab) as BabType[]).find((key) =>
      values.every((value, i) => LEVEL_PRESETS.bab[key][i] === value),
    );
    if (!bab) throw new Error(`${this.name}'s base attack bonuses ${values.join(", ")} follow no progression`);
    return bab;
  }

  /**
   * The levels its Spells Per Day column adds a caster level to another class at ("+1 level of existing arcane
   * spellcasting class"), and that class's kind: an arcane or a divine one, both (a mystic theurge's), or any.
   */
  casterAdvancement(): CasterLevelAdvancement | undefined {
    const cells = this.column(SPELLS_PER_DAY) ?? [];
    const levels = cells.flatMap((cell, i) => (/\+1 level of/i.test(cell) ? [i + 1] : []));
    if (levels.length === 0) return undefined;
    const text = cells.join(" ").toLowerCase();
    const arcane = text.includes("arcane");
    const divine = text.includes("divine");
    const type = arcane && divine ? "dual" : arcane ? "arcane" : divine ? "divine" : "any";
    return { type, levels };
  }

  /** Its progression's column `name`'s cells, a level each: none when it has no such column. */
  column(name: string): string[] | undefined {
    const index = this.progression.columns.indexOf(name);
    return index < 0 ? undefined : this.progression.rows.map((row) => row[index] ?? "");
  }

  /** Its levels: its progression's rows. */
  levels(): number {
    return this.progression.rows.length;
  }

  /** Each save's progression (`saveProgression`). */
  saves(): { fortitude: SaveType; reflex: SaveType; will: SaveType } {
    return {
      fortitude: this.saveProgression("Fort Save"),
      reflex: this.saveProgression("Ref Save"),
      will: this.saveProgression("Will Save"),
    };
  }

  /** The entries its Special column names at each level ("Bonus feat", "bravery +1"), a level each. */
  specials(): string[][] {
    return (this.column("Special") ?? []).map((cell) => splitList(cell).filter((entry) => !EMPTY_CELL.test(entry)));
  }

  /** Its spells known, a row per class level, each its spell levels' from the cantrips: none for a class without. */
  spellsKnown(): number[][] | undefined {
    return this.known?.rows.map((row) => slotsOf(row.slice(1)));
  }

  /** Its spells per day, by its "Spells Per Day <level>" columns: none for a class without. */
  spellsPerDay(): SpellsPerDay | undefined {
    const { columns, rows } = this.progression;
    const indexes = columns.flatMap((column, i) => (column.startsWith(`${SPELLS_PER_DAY} `) ? [i] : []));
    if (indexes.length === 0) return undefined;
    const cells = rows.map((row) => indexes.map((i) => row[i] ?? ""));
    return {
      cantrips: columns[indexes[0]] === `${SPELLS_PER_DAY} 0`,
      domainSlots: cells.some((row) => row.some((cell) => /^\d+\+1$/.test(cell))),
      rows: cells.map(slotsOf),
    };
  }
}
