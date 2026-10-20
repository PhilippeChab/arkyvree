/** What a pasted spell table says: its rows, as a book, a PDF or a spreadsheet writes them, read into counts. */

import { MAX_TABLE_COUNT } from "@/vocabulary/dnd3.5/classes.ts";

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

/** A spell table's cell: a count, every spell of the list (`"all"`, spells known's), or none (`null`). */
export type SpellCell = number | "all" | null;

/** A row's first cell as a class level: "4", "4:", "4th", "4th:". */
const LEVEL_CELL = /^(\d+)(?:st|nd|rd|th)?[:.)]?$/i;

/** The separators of a row's cells, outside a spreadsheet's: spaces, commas, semicolons and bars. */
const SEPARATORS = /[\s,;|]+/;

/** A pasted table (`parseSpellRows`'s): its rows, and the spell level its header names its first count column (`column`). */
function readPastedTable(text: string, allowsAll: boolean, firstLevel: number): { column?: number; rows: PastedRow[] } {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    // A blank line is none, a spreadsheet's row of empty cells a row
    .filter((line) => line.includes("\t") || line.trim() !== "")
    .map(splitCells);
  // A table's header rows aren't levels: those with a word in them ("Level", "Cantrips", "1st"), where a level's row
  // has its level and counts (a cleric's "1+1" isn't a word),
  const isWord = (cell: string) => /[a-z]/i.test(cell) && parseSpellCell(cell, allowsAll) === undefined;
  // and those numbering the spell levels, 0 1 2… (a level's counts never run so)
  const isHeader = ([lead, ...rest]: string[]) =>
    (isWord(lead) && !LEVEL_CELL.test(lead)) ||
    rest.some(isWord) ||
    (rest.length >= 2 && [lead, ...rest].every((cell, index) => cell === String(index)));
  const header = lines.findIndex((cells) => !isHeader(cells));
  const body = header === -1 ? [] : lines.slice(header);
  // A table whose rows count up its levels from 1 or from where it's pasted (`firstLevel`), over three rows or more: a
  // spreadsheet's spacer rows of empty cells aside, and a header of bare numbers over it, its corner cell empty
  const levelColumn = (rows: string[][]) => {
    const leads = rows.filter((cells) => cells.some(Boolean)).map((cells) => LEVEL_CELL.exec(cells[0]));
    const countsFrom = (first: number) => leads.every((lead, index) => lead && Number(lead[1]) === first + index);
    return leads.length >= 3 && (countsFrom(1) || countsFrom(firstLevel));
  };
  const cornered = body[0]?.[0] === "" && levelColumn(body.slice(1));
  const counting = cornered || levelColumn(body);
  const rows = (cornered ? body.slice(1) : body).filter((cells) => !counting || cells.some(Boolean));
  const leads = rows.map((cells) => LEVEL_CELL.exec(cells[0]));
  const read = rows.map((cells, index): PastedRow => {
    const lead = leads[index];
    const named = lead && (counting || !/^\d+$/.test(cells[0]));
    return {
      cells: (named ? cells.slice(1) : cells).map((cell) => parseSpellCell(cell, allowsAll)),
      ...(named && { level: Number(lead[1]) }),
    };
  });
  // The header just above them names its spell levels over the counts: after its level column's, when it has one
  const headerRow = cornered ? body[0] : lines[header - 1];
  const labels = headerRow && (read.some((row) => row.level !== undefined) ? headerRow.slice(1) : headerRow);
  return { column: labels && readSpellLevelLabel(labels[0] ?? ""), rows: read };
}

/** The spell level a header's label names: "0", "1st", "Cantrips"; `undefined` for anything else. */
function readSpellLevelLabel(label: string) {
  if (/^(cantrips?|orisons?)$/i.test(label.trim())) return 0;
  const match = /^(\d)(?:st|nd|rd|th)?$/i.exec(label.trim());
  return match ? Number(match[1]) : undefined;
}

/** A line's cells: a spreadsheet's split on each tab (an empty cell stays one), any other on its separators. */
function splitCells(line: string) {
  return line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : line.trim().split(SEPARATORS);
}

/**
 * A cell as it's typed or pasted (`text`): a count up to the rules' bound, "all" or "*" where spells known take it
 * (`allowsAll`), none for an empty cell or a dash, and `undefined` for anything else.
 */
export function parseSpellCell(text: string, allowsAll: boolean): SpellCell | undefined {
  const cell = text.trim();
  if (cell === "" || /^[-–—]$/.test(cell)) return null;
  if (allowsAll && /^(all|\*)$/i.test(cell)) return "all";
  return /^\d+$/.test(cell) && Number(cell) <= MAX_TABLE_COUNT ? Number(cell) : undefined;
}

/**
 * A pasted block's rows, one a line: each names its class level when its first cell does with a suffix or a colon
 * ("1st", "4:"), or when every row's first cell counts up one a row over three rows or more (a table's level column),
 * from 1 or from the level it's pasted at (`firstLevel`); its other cells are read by `parseSpellCell`, a spreadsheet's
 * empty one as none. Header rows before them, each with a word in it, are left out, and with a level column a
 * spreadsheet's header of bare numbers over it and its spacer rows.
 */
export function parseSpellRows(text: string, allowsAll: boolean, firstLevel = 1): PastedRow[] {
  return readPastedTable(text, allowsAll, firstLevel).rows;
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
 * The spell level a pasted table's first count column is, when its header names it ("Level 1st 2nd": a paladin's, from
 * 1st; "Cantrips 1st": from 0); `undefined` for a table without one, which lands where it's pasted.
 */
export function readPastedColumn(text: string, allowsAll: boolean, firstLevel = 1) {
  return readPastedTable(text, allowsAll, firstLevel).column;
}
