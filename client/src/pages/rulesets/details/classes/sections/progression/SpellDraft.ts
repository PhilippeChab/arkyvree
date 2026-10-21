/**
 * What a class's Spells tab changes before its save: its tables' cells (3.5's spells per day and spells known), by
 * level id then spell level, over the tables as saved; the table they show, and the save they make.
 */

import type { PlacedCell, SpellCell, SpellTableRules } from "./spellPaste.ts";

/** A table's totals as saved, by level id then spell level ("All" for every spell of the list). */
export type SavedSpellTotals = ReadonlyMap<string, Record<string, number | "All">>;

/** A table's cells the tab changed and hasn't saved: by level id, then by spell level. */
export type SpellEdits = Record<SpellTable, Record<string, Record<number, SpellCell>>>;

/** A spell table a class's save takes, by its key: its spells per day, or its spells known (the spells it picks). */
export type SpellTable = SpellTableRules["key"];

/** A tab that changed nothing yet. */
export const NO_SPELL_EDITS: SpellEdits = { known: {}, perDay: {} };

/** A total as a cell holds it: none, a count, or "all". */
export function readSpellCell(total: number | "All" | undefined): SpellCell {
  if (total === undefined) return null;
  return total === "All" ? "all" : total;
}

/**
 * A Spells tab's tables (`saved`, over the class's `levels` in order) with its edits (`edits`), as its rules describe
 * them (`tables`): each cell as it shows, a table's every spell (where it takes one: `all`), once a level has them
 * all, had at every level after it; what a write makes of it; and the save it makes, a row a level it changes.
 */
export class SpellDraft {
  constructor(
    private readonly levels: readonly { id: string }[],
    readonly saved: Record<SpellTable, SavedSpellTotals>,
    readonly edits: SpellEdits,
    private readonly tables: readonly SpellTableRules[],
  ) {
    this.indexById = new Map(levels.map((level, index) => [level.id, index]));
    const firstOf = (which: SpellTable, holds: (cell: SpellCell) => boolean) =>
      this.columnsOf(which).map((spellLevel) =>
        levels.findIndex(({ id }) => holds(this.editedCell(which, id, spellLevel))),
      );
    const firstAll = (which: SpellTable) => (this.allows(which) ? firstOf(which, (cell) => cell === "all") : []);
    this.firstAll = { known: firstAll("known"), perDay: firstAll("perDay") };
    // (a table's "all", where it takes none, is none: its body sends it so)
    const counts = (which: SpellTable) => (cell: SpellCell) =>
      cell !== null && !(cell === "all" && !this.allows(which));
    this.firstCount = { known: firstOf("known", counts("known")), perDay: firstOf("perDay", counts("perDay")) };
  }

  /** Each table's spell levels' first level that has every spell of them: -1 for none. */
  private readonly firstAll: Record<SpellTable, number[]>;

  /** Each table's spell levels' first level with a count (or All): -1 for none. */
  private readonly firstCount: Record<SpellTable, number[]>;

  private readonly indexById: Map<string, number>;

  /** Whether a table takes every spell of a spell level as a cell ("All"). */
  private allows(which: SpellTable) {
    return this.tableOf(which)?.all !== undefined;
  }

  /** A table's spell levels, its columns': none for a table its rules don't have. */
  private columnsOf(which: SpellTable) {
    return (this.tableOf(which)?.columns ?? []).map((_, spellLevel) => spellLevel);
  }

  /** A cell as the edits hold it: an emptied cell's edit is `null`, which holds over the saved value as a count does. */
  private editedCell(which: SpellTable, levelId: string, spellLevel: number): SpellCell {
    const row = this.edits[which][levelId];
    return row && spellLevel in row ? row[spellLevel] : this.savedCell(which, levelId, spellLevel);
  }

  /** The rows a table's save sends: each level it changes, with every spell level's cell. */
  private rowsOf(which: SpellTable) {
    const columns = this.columnsOf(which);
    return this.levels.flatMap(({ id }) =>
      columns.some((spellLevel) => this.cellOf(which, id, spellLevel) !== this.savedCell(which, id, spellLevel))
        ? [{ levelId: id, counts: columns.map((spellLevel) => this.cellOf(which, id, spellLevel)) }]
        : [],
    );
  }

  /** A table as its rules describe it. */
  private tableOf(which: SpellTable) {
    return this.tables.find((table) => table.key === which);
  }

  /** The save's spells: each table's changed rows (spells per day's never hold "all": its type is told so). */
  buildBody() {
    const perDay = this.rowsOf("perDay").map(({ levelId, counts }) => ({
      levelId,
      counts: counts.map((count) => (count === "all" ? null : count)),
    }));
    const known = this.rowsOf("known");
    return { ...(perDay.length > 0 && { perDay }), ...(known.length > 0 && { known }) };
  }

  /** A cell as the table shows it, and as its save writes it. */
  cellOf(which: SpellTable, levelId: string, spellLevel: number): SpellCell {
    if (this.isKnownAbove(which, levelId, spellLevel)) return "all";
    const cell = this.editedCell(which, levelId, spellLevel);
    if (cell !== null) return cell;
    // A column, once counted, reads 0 where it has none, as its save writes it
    const index = this.indexById.get(levelId) ?? 0;
    const first = this.firstCount[which][spellLevel] ?? -1;
    if (first !== -1 && index > first) return 0;
    // A cell emptied where the table that opens it opens the spell level reads 0, as its saved table does (a day's,
    // where its spells known have one)
    const emptied = this.edits[which][levelId] && spellLevel in this.edits[which][levelId];
    const opener = this.tableOf(which)?.zeroWhereOpenedBy;
    if (opener && emptied) {
      const opened = this.cellOf(opener, levelId, spellLevel);
      if (opened === "all" || (typeof opened === "number" && opened > 0)) return 0;
    }
    return null;
  }

  /** The cells of a write (`cells`) that change the table as it shows. */
  changesOf(which: SpellTable, cells: PlacedCell[]) {
    const next = new SpellDraft(this.levels, this.saved, this.write(which, cells), this.tables);
    return cells.filter(
      ({ levelId, spellLevel }) => next.cellOf(which, levelId, spellLevel) !== this.cellOf(which, levelId, spellLevel),
    );
  }

  /** How many of a table's cells show other than saved. */
  countChanged(which: SpellTable) {
    return this.levels.flatMap(({ id }) =>
      this.columnsOf(which).filter(
        (spellLevel) => this.cellOf(which, id, spellLevel) !== this.savedCell(which, id, spellLevel),
      ),
    ).length;
  }

  /** Whether a cell has every spell from an earlier level: it shows All, whatever it holds. */
  isKnownAbove(which: SpellTable, levelId: string, spellLevel: number) {
    const allFrom = this.firstAll[which][spellLevel] ?? -1;
    return allFrom !== -1 && (this.indexById.get(levelId) ?? 0) > allFrom;
  }

  /** A cell as saved. */
  savedCell(which: SpellTable, levelId: string, spellLevel: number) {
    return readSpellCell(this.saved[which].get(levelId)?.[spellLevel]);
  }

  /**
   * The edits once a table's `cells` are written: on one that takes All (Spells Known), a cell under an All keeps no
   * edit of its own, and a count written over a column's first All goes down to the levels saved All by it (not those
   * with a count, nor past an All of their own), so the All is gone, not moved.
   */
  write(which: SpellTable, cells: PlacedCell[]): SpellEdits {
    const next = { ...this.edits[which] };
    const place = (levelId: string, spellLevel: number, value: SpellCell) => {
      next[levelId] = { ...next[levelId], [spellLevel]: value };
    };
    for (const { levelId, spellLevel, value } of cells) {
      place(levelId, spellLevel, value);
      const first = this.levels[this.firstAll[which][spellLevel] ?? -1];
      if (!this.allows(which) || value === "all" || first?.id !== levelId) continue;
      // The levels below it as saved: a count stays, an All by it takes the count written nearest above it, one that's its
      // own (or one written) stops it
      const index = this.indexById.get(levelId) ?? 0;
      let carried: SpellCell = value;
      for (const [offset, { id }] of this.levels.slice(index + 1).entries()) {
        const previous = this.levels[index + offset];
        const saved = this.savedCell(which, id, spellLevel);
        if (saved === "all" && previous && this.savedCell(which, previous.id, spellLevel) !== "all") break;
        const written = cells.find((cell) => cell.levelId === id && cell.spellLevel === spellLevel);
        if (written?.value === "all") break;
        if (written) carried = written.value;
        else if (saved === "all" && !(id in next && spellLevel in next[id])) place(id, spellLevel, carried);
      }
    }
    const written = { ...this.edits, [which]: next };
    if (!this.allows(which)) return written;
    const draft = new SpellDraft(this.levels, this.saved, written, this.tables);
    for (const spellLevel of this.columnsOf(which)) {
      let known = false;
      for (const { id } of this.levels) {
        if (known && next[id] && spellLevel in next[id]) {
          const row = { ...next[id] };
          delete row[spellLevel];
          next[id] = row;
        }
        known ||= draft.editedCell(which, id, spellLevel) === "all";
      }
    }
    return written;
  }
}
