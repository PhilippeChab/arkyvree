/**
 * What an owner's tables' tab changes before its save: its tables' cells (3.5's spells per day and spells known), by
 * level id then column, over the tables as saved; the table they show, and the save they make.
 */

import type { PlacedCell, TableCell, TableRules } from "./tablePaste.ts";

/** A table's totals as saved, by level id then column ("All" for every value of the column: every spell of a list). */
export type SavedTotals = ReadonlyMap<string, Record<string, number | "All">>;

/** Each table's cells the tab changed and hasn't saved, by its key: by level id, then by column. */
export type TableEdits = Record<string, Record<string, Record<number, TableCell>>>;

/** Its tables (`tables`) as a tab that changed nothing yet holds them. */
export function noEdits(tables: readonly TableRules[]): TableEdits {
  return Object.fromEntries(tables.map((table) => [table.key, {}]));
}

/** A total as a cell holds it: none, a count, or "all". */
export function readTableCell(total: number | "All" | undefined): TableCell {
  if (total === undefined) return null;
  return total === "All" ? "all" : total;
}

/**
 * A tables' tab's tables (`saved`, over the owner's `levels` in order) with its edits (`edits`), as its rules describe
 * them (`tables`): each cell as it shows, a column's every value (where it takes one: `all`), once a level has them
 * all, had at every level after it; what a write makes of it; and the save it makes, a row a level it changes.
 */
export class TableDraft {
  constructor(
    private readonly levels: readonly { id: string }[],
    readonly saved: Record<string, SavedTotals>,
    readonly edits: TableEdits,
    private readonly tables: readonly TableRules[],
  ) {
    this.indexById = new Map(levels.map((level, index) => [level.id, index]));
    const firstOf = (which: string, holds: (cell: TableCell) => boolean) =>
      this.columnsOf(which).map((column) => levels.findIndex(({ id }) => holds(this.editedCell(which, id, column))));
    const firstAll = (which: string) => (this.allows(which) ? firstOf(which, (cell) => cell === "all") : []);
    this.firstAll = Object.fromEntries(tables.map(({ key }) => [key, firstAll(key)]));
    // (a table's "all", where it takes none, is none: its body sends it so)
    const counts = (which: string) => (cell: TableCell) => cell !== null && !(cell === "all" && !this.allows(which));
    this.firstCount = Object.fromEntries(tables.map(({ key }) => [key, firstOf(key, counts(key))]));
  }

  /** Each table's columns' first level that has every value of them: -1 for none. */
  private readonly firstAll: Record<string, number[]>;

  /** Each table's columns' first level with a count (or All): -1 for none. */
  private readonly firstCount: Record<string, number[]>;

  private readonly indexById: Map<string, number>;

  /** Whether a table takes every value of a column as a cell ("All": every spell of a spell level). */
  private allows(which: string) {
    return this.tableOf(which)?.all !== undefined;
  }

  /** A table's columns, by index: none for a table its rules don't have. */
  private columnsOf(which: string) {
    return (this.tableOf(which)?.columns ?? []).map((_, column) => column);
  }

  /** A cell as the edits hold it: an emptied cell's edit is `null`, which holds over the saved value as a count does. */
  private editedCell(which: string, levelId: string, column: number): TableCell {
    const row = this.edits[which]?.[levelId];
    return row && column in row ? row[column] : this.savedCell(which, levelId, column);
  }

  /** The rows a table's save sends: each level it changes, with every column's cell. */
  private rowsOf(which: string) {
    const columns = this.columnsOf(which);
    return this.levels.flatMap(({ id }) =>
      columns.some((column) => this.cellOf(which, id, column) !== this.savedCell(which, id, column))
        ? [{ levelId: id, counts: columns.map((column) => this.cellOf(which, id, column)) }]
        : [],
    );
  }

  /** A table as its rules describe it. */
  private tableOf(which: string) {
    return this.tables.find((table) => table.key === which);
  }

  /**
   * The save's tables: each one's changed rows, by its key, in its rules' order (a table that takes no "all" never
   * holds one: its type is told so).
   */
  buildBody() {
    return Object.fromEntries(
      this.tables.flatMap(({ key }) => {
        const rows = this.rowsOf(key).map(({ levelId, counts }) => ({
          levelId,
          counts: counts.map((count) => (count === "all" && !this.allows(key) ? null : count)),
        }));
        return rows.length > 0 ? [[key, rows]] : [];
      }),
    );
  }

  /** A cell as the table shows it, and as its save writes it. */
  cellOf(which: string, levelId: string, column: number): TableCell {
    if (this.isKnownAbove(which, levelId, column)) return "all";
    const cell = this.editedCell(which, levelId, column);
    if (cell !== null) return cell;
    // A column, once counted, reads 0 where it has none, as its save writes it
    const index = this.indexById.get(levelId) ?? 0;
    const first = this.firstCount[which][column] ?? -1;
    if (first !== -1 && index > first) return 0;
    // A cell emptied where the table that opens it opens the column reads 0, as its saved table does (3.5's spells per
    // day, where its spells known have one)
    const emptied = this.edits[which]?.[levelId] && column in this.edits[which][levelId];
    const opener = this.tableOf(which)?.zeroWhereOpenedBy;
    if (opener && emptied) {
      const opened = this.cellOf(opener, levelId, column);
      if (opened === "all" || (typeof opened === "number" && opened > 0)) return 0;
    }
    return null;
  }

  /** The cells of a write (`cells`) that change the table as it shows. */
  changesOf(which: string, cells: PlacedCell[]) {
    const next = new TableDraft(this.levels, this.saved, this.write(which, cells), this.tables);
    return cells.filter(
      ({ levelId, column }) => next.cellOf(which, levelId, column) !== this.cellOf(which, levelId, column),
    );
  }

  /** How many of a table's cells show other than saved. */
  countChanged(which: string) {
    return this.levels.flatMap(({ id }) =>
      this.columnsOf(which).filter((column) => this.cellOf(which, id, column) !== this.savedCell(which, id, column)),
    ).length;
  }

  /** Whether a cell has every value from an earlier level: it shows All, whatever it holds. */
  isKnownAbove(which: string, levelId: string, column: number) {
    const allFrom = this.firstAll[which][column] ?? -1;
    return allFrom !== -1 && (this.indexById.get(levelId) ?? 0) > allFrom;
  }

  /** A cell as saved. */
  savedCell(which: string, levelId: string, column: number) {
    return readTableCell(this.saved[which]?.get(levelId)?.[column]);
  }

  /**
   * The edits once a table's `cells` are written: on one that takes All (Spells Known), a cell under an All keeps no
   * edit of its own, and a count written over a column's first All goes down to the levels saved All by it (not those
   * with a count, nor past an All of their own), so the All is gone, not moved.
   */
  write(which: string, cells: PlacedCell[]): TableEdits {
    const next = { ...this.edits[which] };
    const place = (levelId: string, column: number, value: TableCell) => {
      next[levelId] = { ...next[levelId], [column]: value };
    };
    for (const { levelId, column, value } of cells) {
      place(levelId, column, value);
      const first = this.levels[this.firstAll[which][column] ?? -1];
      if (!this.allows(which) || value === "all" || first?.id !== levelId) continue;
      // The levels below it as saved: a count stays, an All by it takes the count written nearest above it, one that's its
      // own (or one written) stops it
      const index = this.indexById.get(levelId) ?? 0;
      let carried: TableCell = value;
      for (const [offset, { id }] of this.levels.slice(index + 1).entries()) {
        const previous = this.levels[index + offset];
        const saved = this.savedCell(which, id, column);
        if (saved === "all" && previous && this.savedCell(which, previous.id, column) !== "all") break;
        const written = cells.find((cell) => cell.levelId === id && cell.column === column);
        if (written?.value === "all") break;
        if (written) carried = written.value;
        else if (saved === "all" && !(id in next && column in next[id])) place(id, column, carried);
      }
    }
    const written = { ...this.edits, [which]: next };
    if (!this.allows(which)) return written;
    const draft = new TableDraft(this.levels, this.saved, written, this.tables);
    for (const column of this.columnsOf(which)) {
      let known = false;
      for (const { id } of this.levels) {
        if (known && next[id] && column in next[id]) {
          const row = { ...next[id] };
          delete row[column];
          next[id] = row;
        }
        known ||= draft.editedCell(which, id, column) === "all";
      }
    }
    return written;
  }
}
