/**
 * What an owner's tables' tab changes before its save (3.5's spells per day and spells known): its tables' cells, by
 * owned entity id then column, over the tables as saved; the table they show, its rules' answer for them, and the save
 * they make.
 */

import type { PlacedCell, TableCell, TableRules } from "./tablePaste.ts";

/**
 * The rules' answer for a draft's save (`body`, its `buildBody`): each table's totals as the save would leave them, by
 * its key (`totals`).
 */
export interface PlannedTables {
  body: TablesBody;
  totals: Record<string, SavedTotals>;
}

/**
 * A table's totals as saved, by owned entity id then column ("All" for every value of the column: every spell of a
 * list).
 */
export type SavedTotals = ReadonlyMap<string, Record<string, number | "All">>;

/** Each table's cells the tab changed and hasn't saved, by its key: by owned entity id, then by column. */
export type TableEdits = Record<string, Record<string, Record<number, TableCell>>>;

/** A save's tables, by their keys: each one's rows it changes, an owned entity's with its every column's cell. */
export type TablesBody = Record<string, { counts: TableCell[]; ownedId: string }[]>;

/** Whether two saves (`a`, `b`) send the same rows of the same tables, cell for cell. */
function isSameBody(a: TablesBody, b: TablesBody) {
  const keys = Object.keys(a);
  const sameRows = (rows: TablesBody[string], others: TablesBody[string] = []) =>
    rows.length === others.length &&
    rows.every(({ counts, ownedId }, index) => {
      const other = others[index];
      return (
        other?.ownedId === ownedId &&
        other.counts.length === counts.length &&
        counts.every((count, column) => count === other.counts[column])
      );
    });
  return keys.length === Object.keys(b).length && keys.every((key) => sameRows(a[key] ?? [], b[key]));
}

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
 * A tables' tab's tables (`saved`, over the owner's `ownedEntities` in order) with its edits (`edits`), as its rules
 * describe them (`tables`): each cell as it shows, its rules' answer for the save it makes once they gave it
 * (`planned`, which reads a column's empty cells after a count as 0, its every value carried down from the first that
 * has it, and a spell level the spells known open as 0 a day; an answer for another draft is none), else as edited; a
 * cell under one that shows a column's every value (where it takes one: `all`) taking no edit; what a write makes of
 * it; and the save it makes, a row an owned entity it changes.
 */
export class TableDraft {
  constructor(
    private readonly ownedEntities: readonly { id: string }[],
    readonly saved: Record<string, SavedTotals>,
    readonly edits: TableEdits,
    private readonly tables: readonly TableRules[],
    private readonly planned?: PlannedTables,
  ) {
    this.indexById = new Map(ownedEntities.map((ownedEntity, index) => [ownedEntity.id, index]));
    const firstAll = (which: string) =>
      this.allows(which)
        ? this.columnsOf(which).map((column) =>
            ownedEntities.findIndex(({ id }) => this.editedCell(which, id, column) === "all"),
          )
        : [];
    this.firstAll = Object.fromEntries(tables.map(({ key }) => [key, firstAll(key)]));
    const body = this.buildBody();
    this.answer = planned && Object.keys(body).length > 0 && isSameBody(planned.body, body) ? planned : undefined;
  }

  /** Its rules' answer for the save it makes: none till they gave it, nor for a draft that saves nothing. */
  private readonly answer?: PlannedTables;

  /**
   * Each table's columns' first owned entity that has every value of them as edited, which a write's meaning reads
   * before its rules answer it: -1 for none.
   */
  private readonly firstAll: Record<string, number[]>;

  private readonly indexById: Map<string, number>;

  /** Whether a table takes every value of a column as a cell ("All": every spell of a spell level). */
  private allows(which: string) {
    return this.tableOf(which)?.all !== undefined;
  }

  /** A table's columns, by index: none for a table its rules don't have. */
  private columnsOf(which: string) {
    return (this.tableOf(which)?.columns ?? []).map((_, column) => column);
  }

  /** The rows a table's save sends: each owned entity whose edits change a cell, with every column's cell as edited. */
  private rowsOf(which: string) {
    const columns = this.columnsOf(which);
    return this.ownedEntities.flatMap(({ id }) =>
      columns.some((column) => this.editedCell(which, id, column) !== this.savedCell(which, id, column))
        ? [{ ownedId: id, counts: columns.map((column) => this.editedCell(which, id, column)) }]
        : [],
    );
  }

  /** A table as its rules describe it. */
  private tableOf(which: string) {
    return this.tables.find((table) => table.key === which);
  }

  /** Whether its rules answered the save it makes: what its cells show is what its save leaves. */
  get answered() {
    return this.answer !== undefined;
  }

  /**
   * The save's tables: each one's changed rows, by its key, in its rules' order (a table that takes no "all" never
   * holds one: its type is told so).
   */
  buildBody(): TablesBody {
    return Object.fromEntries(
      this.tables.flatMap(({ key }) => {
        const rows = this.rowsOf(key).map(({ ownedId, counts }) => ({
          ownedId,
          counts: counts.map((count) => (count === "all" && !this.allows(key) ? null : count)),
        }));
        return rows.length > 0 ? [[key, rows]] : [];
      }),
    );
  }

  /**
   * A cell as the table shows it: as its save leaves it, its rules' answer, once they gave it; else as the edits hold
   * it, typed or saved. A draft that saves nothing shows its tables as saved.
   */
  cellOf(which: string, ownedId: string, column: number): TableCell {
    if (this.answer) return readTableCell(this.answer.totals[which]?.get(ownedId)?.[column]);
    return this.editedCell(which, ownedId, column);
  }

  /** The cells of a write (`cells`) that change the table as it shows. */
  changesOf(which: string, cells: PlacedCell[]) {
    const next = this.withEdits(this.write(which, cells));
    return cells.filter(
      ({ ownedId, column }) => next.cellOf(which, ownedId, column) !== this.cellOf(which, ownedId, column),
    );
  }

  /** How many of a table's cells show other than saved. */
  countChanged(which: string) {
    return this.ownedEntities.flatMap(({ id }) =>
      this.columnsOf(which).filter((column) => this.cellOf(which, id, column) !== this.savedCell(which, id, column)),
    ).length;
  }

  /**
   * A cell as the edits hold it, typed or saved: an emptied cell's edit is `null`, which holds over the saved value as a
   * count does. A typed value is written when it differs from it, whatever the cell shows.
   */
  editedCell(which: string, ownedId: string, column: number): TableCell {
    const row = this.edits[which]?.[ownedId];
    return row && column in row ? row[column] : this.savedCell(which, ownedId, column);
  }

  /**
   * Whether a cell is under one that shows every value of its column, at any owned entity before it (its rules' answer
   * carries it down; a draft they haven't answered, as edited): it takes no edit.
   */
  isAllAbove(which: string, ownedId: string, column: number) {
    const index = this.indexById.get(ownedId) ?? 0;
    return this.ownedEntities.slice(0, index).some(({ id }) => this.cellOf(which, id, column) === "all");
  }

  /** A cell as saved. */
  savedCell(which: string, ownedId: string, column: number) {
    return readTableCell(this.saved[which]?.get(ownedId)?.[column]);
  }

  /** The draft of other edits (`edits`) over the same tables, its rules' answer kept. */
  withEdits(edits: TableEdits) {
    return new TableDraft(this.ownedEntities, this.saved, edits, this.tables, this.planned);
  }

  /**
   * The edits once a table's `cells` are written, as their writer means them, over the edits as they hold them (its
   * rules answer them only once written): on one that takes All (Spells Known), a cell under an All keeps no edit of its
   * own, which would come back once the All is gone, and a count written over a column's first All goes down to the
   * owned entities saved All by it (not those with a count, nor past an All of their own), so the All is gone, not moved
   * down a level, as its rules would read the levels saved All after it.
   */
  write(which: string, cells: PlacedCell[]): TableEdits {
    const next = { ...this.edits[which] };
    const place = (ownedId: string, column: number, value: TableCell) => {
      next[ownedId] = { ...next[ownedId], [column]: value };
    };
    for (const { ownedId, column, value } of cells) {
      place(ownedId, column, value);
      const first = this.ownedEntities[this.firstAll[which][column] ?? -1];
      if (!this.allows(which) || value === "all" || first?.id !== ownedId) continue;
      // The owned entities below it as saved: a count stays, an All by it takes the count written nearest above it, one
      // that's its own (or one written) stops it
      const index = this.indexById.get(ownedId) ?? 0;
      let carried: TableCell = value;
      for (const [offset, { id }] of this.ownedEntities.slice(index + 1).entries()) {
        const previous = this.ownedEntities[index + offset];
        const saved = this.savedCell(which, id, column);
        if (saved === "all" && previous && this.savedCell(which, previous.id, column) !== "all") break;
        const written = cells.find((cell) => cell.ownedId === id && cell.column === column);
        if (written?.value === "all") break;
        if (written) carried = written.value;
        else if (saved === "all" && !(id in next && column in next[id])) place(id, column, carried);
      }
    }
    const written = { ...this.edits, [which]: next };
    if (!this.allows(which)) return written;
    const draft = this.withEdits(written);
    for (const column of this.columnsOf(which)) {
      let all = false;
      for (const { id } of this.ownedEntities) {
        if (all && next[id] && column in next[id]) {
          const row = { ...next[id] };
          delete row[column];
          next[id] = row;
        }
        all ||= draft.editedCell(which, id, column) === "all";
      }
    }
    return written;
  }
}
