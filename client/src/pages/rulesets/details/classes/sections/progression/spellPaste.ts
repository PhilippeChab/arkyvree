/** What a pasted spell table says: its rows, as a book, a PDF or a spreadsheet writes them, read into counts. */

import type { RulesProgression } from "@/client/src/lib/queries.ts";

/** A row a paste gives: the class level it names, when it names one, and its cells from the column it lands at. */
export interface PastedRow {
  /** Unreadable cells are `undefined`: they leave the cell they land on as it is */
  cells: (SpellCell | undefined)[];
  level?: number;
}

/** A cell a paste writes: the level's, the spell level's, and what it holds. */
export interface PlacedCell {
  levelId: string;
  spellLevel: number;
  value: SpellCell;
}

/** A spell table's cell: a count, every spell of the list (`"all"`, where its table takes it), or none (`null`). */
export type SpellCell = number | "all" | null;

/**
 * A spell table as its rules describe it: its label, its cells' most, its word for every spell (`all`, none where it
 * takes none), and its columns, a spell level each, with the words a header names them by.
 */
export type SpellTableRules = RulesProgression["tables"][number];

/** A row's first cell as a class level: "4", "4:", "4th", "4th:". */
const LEVEL_CELL = /^(\d+)(?:st|nd|rd|th)?[:.)]?$/i;

/** The separators of a row's cells, outside a spreadsheet's: spaces, commas, semicolons and bars. */
const SEPARATORS = /[\s,;|]+/;

/** The column a header's label names, by one of its words ("0", "1st", "Cantrips"); `undefined` for anything else. */
function readColumnLabel(table: SpellTableRules, label: string) {
  const word = label.trim().toLowerCase();
  const index = table.columns.findIndex((column) => column.aliases.includes(word));
  return index === -1 ? undefined : index;
}

/** A pasted table (`parseSpellRows`'s): its rows, and the spell level its header names its first count column (`column`). */
function readPastedTable(
  text: string,
  table: SpellTableRules,
  firstLevel: number,
): { column?: number; rows: PastedRow[] } {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    // A blank line is none, a spreadsheet's row of empty cells a row
    .filter((line) => line.includes("\t") || line.trim() !== "")
    .map(splitCells);
  // A table's header rows aren't levels: those with a word in them ("Level", "Cantrips", "1st"), where a level's row
  // has its level and counts (a cleric's "1+1" isn't a word),
  const isWord = (cell: string) => /[a-z]/i.test(cell) && parseSpellCell(cell, table) === undefined;
  // and those numbering the spell levels, 0 1 2… (a level's counts never run so)
  const isHeader = ([lead, ...rest]: string[]) =>
    (isWord(lead) && !LEVEL_CELL.test(lead)) ||
    rest.some(isWord) ||
    (rest.length >= 2 && [lead, ...rest].every((cell, index) => cell === String(index)));
  const header = lines.findIndex((cells) => !isHeader(cells));
  const body = header === -1 ? [] : lines.slice(header);
  // A table whose rows count up its levels from 1 or from where it's pasted (`firstLevel`), over three rows or more: a
  // spreadsheet's spacer rows of empty cells aside, and a header of bare numbers over it, its corner cell empty
  // (each with counts after its level: a single column of counts is counts)
  const filled = (rows: string[][]) => rows.filter((cells) => cells.some(Boolean));
  const levelColumn = (rows: string[][]) => {
    const leads = filled(rows).map((cells) => LEVEL_CELL.exec(cells[0]));
    const countsFrom = (first: number) => leads.every((lead, index) => lead && Number(lead[1]) === first + index);
    const counted = filled(rows).every((cells) => cells.length >= 2);
    return counted && leads.length >= 3 && (countsFrom(1) || countsFrom(firstLevel));
  };
  const cornered = body[0]?.[0] === "" && levelColumn(body.slice(1));
  // A header led by "Level" says its rows are led by theirs, however few
  const levelHeader = /^(class\s+)?(level|lvl)\.?$/i.test(lines[header - 1]?.[0]?.trim() ?? "");
  const counting =
    cornered || levelColumn(body) || (levelHeader && filled(body).every((cells) => LEVEL_CELL.test(cells[0])));
  const rows = (cornered ? body.slice(1) : body).filter((cells) => !counting || cells.some(Boolean));
  const leads = rows.map((cells) => LEVEL_CELL.exec(cells[0]));
  const read = rows.map((cells, index): PastedRow => {
    const lead = leads[index];
    const named = lead && (counting || !/^\d+$/.test(cells[0]));
    return {
      cells: (named ? cells.slice(1) : cells).map((cell) => parseSpellCell(cell, table)),
      ...(named && { level: Number(lead[1]) }),
    };
  });
  // The header just above them names its spell levels over the counts: its first cell that names one ("0", "1st",
  // "Cantrips"), past whatever stands over a level column ("Level", "Class Level", nothing)
  const headerRow = cornered ? body[0] : lines[header - 1];
  const labels = (headerRow ?? []).map((label) => readColumnLabel(table, label));
  return { column: labels.find((label) => label !== undefined), rows: read };
}

/** A line's cells: a spreadsheet's split on each tab (an empty cell stays one), any other on its separators. */
function splitCells(line: string) {
  return line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : line.trim().split(SEPARATORS);
}

/**
 * A cell of a table (`table`) as it's typed or pasted (`text`): a count up to its most, its word for every spell
 * ("All") or "*" where it takes one, none for an empty cell or a dash, and `undefined` for anything else.
 */
export function parseSpellCell(text: string, table: SpellTableRules): SpellCell | undefined {
  const cell = text.trim();
  if (cell === "" || /^[-–—]$/.test(cell)) return null;
  if (table.all !== undefined && (cell === "*" || cell.toLowerCase() === table.all.toLowerCase())) return "all";
  return /^\d+$/.test(cell) && Number(cell) <= table.max ? Number(cell) : undefined;
}

/**
 * A pasted block's rows, one a line: each names its class level when its first cell does with a suffix or a colon
 * ("1st", "4:"), or when every row's first cell counts up one a row over three rows or more (a table's level column),
 * from 1 or from the level it's pasted at (`firstLevel`); its other cells are read by `parseSpellCell`, a spreadsheet's
 * empty one as none. Header rows before them, each with a word in it, are left out, and with a level column a
 * spreadsheet's header of bare numbers over it and its spacer rows.
 */
export function parseSpellRows(text: string, table: SpellTableRules, firstLevel = 1): PastedRow[] {
  return readPastedTable(text, table, firstLevel).rows;
}

/**
 * Where a paste's rows land on a class's levels (`levels`, by their number): a row naming a level on it, the others a
 * level each after the last (from `startIndex`), their cells from `startColumn` on; a level the class lacks (the rows
 * after it go on from the next level it has), a spell level past `columns` and an unreadable cell are left out.
 */
export function placeSpellRows(
  rows: readonly PastedRow[],
  levels: readonly { id: string; level: number }[],
  startIndex: number,
  startColumn: number,
  columns: number,
): PlacedCell[] {
  let next = startIndex;
  return rows.flatMap((row) => {
    const named = row.level;
    const index = named === undefined ? next : levels.findIndex(({ level }) => level === named);
    if (named !== undefined && index === -1) {
      const after = levels.findIndex(({ level }) => level > named);
      next = after === -1 ? levels.length : after;
      return [];
    }
    next = index + 1;
    const level = levels[index];
    if (!level) return [];
    return row.cells.flatMap((value, offset) => {
      const spellLevel = startColumn + offset;
      return value === undefined || spellLevel >= columns ? [] : [{ levelId: level.id, spellLevel, value }];
    });
  });
}

/**
 * A table's (`table`) pasted cells where they land (`placeSpellRows`'s), read once: its rows from the level at
 * `startIndex`, its counts from the spell level its header names, else from `startColumn`.
 */
export function placeSpellTable(
  text: string,
  table: SpellTableRules,
  levels: readonly { id: string; level: number }[],
  startIndex: number,
  startColumn: number,
) {
  const { column, rows } = readPastedTable(text, table, levels[startIndex]?.level ?? 1);
  return placeSpellRows(rows, levels, startIndex, column ?? startColumn, table.columns.length);
}
