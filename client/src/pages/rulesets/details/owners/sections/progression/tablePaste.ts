/**
 * What a pasted table of an owner's says (3.5's spells per day): its rows, as a book, a PDF or a spreadsheet writes
 * them, read into counts.
 */

import type { RulesProgression } from "@/client/src/lib/queries.ts";

/** A row a paste gives: the position it names, when it names one, and its cells from the column it lands at. */
export interface PastedRow {
  /** Unreadable cells are `undefined`: they leave the cell they land on as it is */
  cells: (TableCell | undefined)[];
  position?: number;
}

/** A cell a paste writes: the owned entity's, the column's (by index), and what it holds. */
export interface PlacedCell {
  column: number;
  ownedId: string;
  value: TableCell;
}

/** A table's cell: a count, every value of its column (`"all"`, where its table takes it), or none (`null`). */
export type TableCell = number | "all" | null;

/**
 * An owner's table as its rules describe it: its label, its cells' most, its word for every value (`all`, none where
 * it takes none), and its columns (3.5's spell levels), with the words a header names them by.
 */
export type TableRules = RulesProgression["tables"][number];

/** A row's first cell as a position: "4", "4:", "4th", "4th:". */
const POSITION_CELL = /^(\d+)(?:st|nd|rd|th)?[:.)]?$/i;

/** The separators of a row's cells, outside a spreadsheet's: spaces, commas, semicolons and bars. */
const SEPARATORS = /[\s,;|]+/;

/** The column a header's label names, by one of its words ("0", "1st", "Cantrips"); `undefined` for anything else. */
function readColumnLabel(table: TableRules, label: string) {
  const word = label.trim().toLowerCase();
  const index = table.columns.findIndex((column) => column.aliases.includes(word));
  return index === -1 ? undefined : index;
}

/** A pasted table (`parseTableRows`'s): its rows, and the column its header names its first count column (`column`). */
function readPastedTable(
  text: string,
  table: TableRules,
  firstPosition: number,
): { column?: number; rows: PastedRow[] } {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    // A blank line is none, a spreadsheet's row of empty cells a row
    .filter((line) => line.includes("\t") || line.trim() !== "")
    .map(splitCells);
  // A table's header rows aren't owned entities: those with a word in them ("Level", "Cantrips", "1st"), where an owned
  // entity's row has its position and counts (a cleric's "1+1" isn't a word),
  const isWord = (cell: string) => /[a-z]/i.test(cell) && parseTableCell(cell, table) === undefined;
  // and those numbering the columns as their keys run, 0 1 2… or, a table of spell slots, 1 2 3… (an owned entity's
  // counts never run so)
  const keys = table.columns.map(({ key }) => key);
  const isHeader = ([lead, ...rest]: string[]) =>
    (isWord(lead) && !POSITION_CELL.test(lead)) ||
    rest.some(isWord) ||
    (rest.length >= 2 && [lead, ...rest].every((cell, index) => cell === keys[index]));
  const header = lines.findIndex((cells) => !isHeader(cells));
  const body = header === -1 ? [] : lines.slice(header);
  // A table whose rows count up its positions from 1 or from where it's pasted (`firstPosition`), over three rows or
  // more: a spreadsheet's spacer rows of empty cells aside, and a header of bare numbers over it, its corner cell empty
  // (each with counts after its position: a single column of counts is counts)
  const filled = (rows: string[][]) => rows.filter((cells) => cells.some(Boolean));
  const positionColumn = (rows: string[][]) => {
    const leads = filled(rows).map((cells) => POSITION_CELL.exec(cells[0]));
    const countsFrom = (first: number) => leads.every((lead, index) => lead && Number(lead[1]) === first + index);
    const counted = filled(rows).every((cells) => cells.length >= 2);
    return counted && leads.length >= 3 && (countsFrom(1) || countsFrom(firstPosition));
  };
  const cornered = body[0]?.[0] === "" && positionColumn(body.slice(1));
  // A header led by its table's word for a position ("Level"), or by a word and it ("Class Level"), says its rows are
  // led by theirs, however few
  const headerWord = /^(?:\p{L}+\s+)?(\p{L}+)\.?$/u.exec(lines[header - 1]?.[0]?.trim() ?? "")?.[1];
  const positionHeader = !!headerWord && table.positionAliases.includes(headerWord.toLowerCase());
  const counting =
    cornered || positionColumn(body) || (positionHeader && filled(body).every((cells) => POSITION_CELL.test(cells[0])));
  const rows = (cornered ? body.slice(1) : body).filter((cells) => !counting || cells.some(Boolean));
  const leads = rows.map((cells) => POSITION_CELL.exec(cells[0]));
  const read = rows.map((cells, index): PastedRow => {
    const lead = leads[index];
    const named = lead && (counting || !/^\d+$/.test(cells[0]));
    return {
      cells: (named ? cells.slice(1) : cells).map((cell) => parseTableCell(cell, table)),
      ...(named && { position: Number(lead[1]) }),
    };
  });
  // The header just above them names its columns over the counts: its first cell that names one ("0", "1st",
  // "Cantrips"), past whatever stands over a position column ("Level", "Class Level", nothing)
  const headerRow = cornered ? body[0] : lines[header - 1];
  const labels = (headerRow ?? []).map((label) => readColumnLabel(table, label));
  return { column: labels.find((label) => label !== undefined), rows: read };
}

/** A line's cells: a spreadsheet's split on each tab (an empty cell stays one), any other on its separators. */
function splitCells(line: string) {
  return line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : line.trim().split(SEPARATORS);
}

/**
 * A cell of a table (`table`) as it's typed or pasted (`text`): a count up to its most, its word for every value
 * ("All") or "*" where it takes one, none for an empty cell or a dash, and `undefined` for anything else.
 */
export function parseTableCell(text: string, table: TableRules): TableCell | undefined {
  const cell = text.trim();
  if (cell === "" || /^[-–—]$/.test(cell)) return null;
  if (table.all !== undefined && (cell === "*" || cell.toLowerCase() === table.all.word.toLowerCase())) return "all";
  return /^\d+$/.test(cell) && Number(cell) <= table.max ? Number(cell) : undefined;
}

/**
 * A pasted block's rows, one a line: each names its position when its first cell does with a suffix or a colon
 * ("1st", "4:"), or when every row's first cell counts up one a row over three rows or more (a table's position
 * column), from 1 or from the position it's pasted at (`firstPosition`); its other cells are read by `parseTableCell`,
 * a spreadsheet's empty one as none. Header rows before them, each with a word in it, are left out, and with a position
 * column a spreadsheet's header of bare numbers over it and its spacer rows.
 */
export function parseTableRows(text: string, table: TableRules, firstPosition = 1): PastedRow[] {
  return readPastedTable(text, table, firstPosition).rows;
}

/**
 * A table's (`table`) pasted cells where they land (`placeTableRows`'s), read once: its rows from the owned entity at
 * `startIndex`, its counts from the column its header names, else from `startColumn`.
 */
export function placeTable(
  text: string,
  table: TableRules,
  ownedEntities: readonly { id: string; position: number }[],
  startIndex: number,
  startColumn: number,
) {
  const { column, rows } = readPastedTable(text, table, ownedEntities[startIndex]?.position ?? 1);
  return placeTableRows(rows, ownedEntities, startIndex, column ?? startColumn, table.columns.length);
}

/**
 * Where a paste's rows land on an owner's owned entities (`ownedEntities`, by their number): a row naming a position
 * on it, the others an owned entity each after the last (from `startIndex`), their cells from `startColumn` on; a
 * position the owner lacks (the rows after it go on from the next owned entity it has), a column past `columns` and an
 * unreadable cell are left out.
 */
export function placeTableRows(
  rows: readonly PastedRow[],
  ownedEntities: readonly { id: string; position: number }[],
  startIndex: number,
  startColumn: number,
  columns: number,
): PlacedCell[] {
  let next = startIndex;
  return rows.flatMap((row) => {
    const named = row.position;
    const index = named === undefined ? next : ownedEntities.findIndex(({ position }) => position === named);
    if (named !== undefined && index === -1) {
      const after = ownedEntities.findIndex(({ position }) => position > named);
      next = after === -1 ? ownedEntities.length : after;
      return [];
    }
    next = index + 1;
    const ownedEntity = ownedEntities[index];
    if (!ownedEntity) return [];
    return row.cells.flatMap((value, offset) => {
      const column = startColumn + offset;
      return value === undefined || column >= columns ? [] : [{ ownedId: ownedEntity.id, column, value }];
    });
  });
}
