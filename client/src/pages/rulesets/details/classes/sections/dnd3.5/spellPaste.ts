/** What a pasted spell table says: its rows, as a book, a PDF or a spreadsheet writes them, read into counts. */

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

/** The separators of a row's cells: tabs, spaces, commas, semicolons and bars. */
const SEPARATORS = /[\s,;|]+/;

/**
 * A cell as it's typed or pasted (`text`): a count, "all" or "*" where spells known take it (`allowsAll`), none for an
 * empty cell or a dash, and `undefined` for anything else.
 */
export function parseSpellCell(text: string, allowsAll: boolean): SpellCell | undefined {
  const cell = text.trim();
  if (cell === "" || /^[-–—]$/.test(cell)) return null;
  if (allowsAll && /^(all|\*)$/i.test(cell)) return "all";
  return /^\d+$/.test(cell) ? Number(cell) : undefined;
}

/**
 * A pasted block's rows, one a line: each names its class level when its first cell does with a suffix or a colon
 * ("1st", "4:"), or when every row's first cell counts up one a row over three rows or more; its other cells are read
 * by `parseSpellCell`.
 */
export function parseSpellRows(text: string, allowsAll: boolean): PastedRow[] {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(SEPARATORS));
  const leads = rows.map((cells) => LEVEL_CELL.exec(cells[0]));
  const counting =
    rows.length >= 3 && leads.every((lead, index) => lead && Number(lead[1]) === Number(leads[0]![1]) + index);
  return rows.map((cells, index) => {
    const lead = leads[index];
    const named = lead && (counting || !/^\d+$/.test(cells[0]));
    return {
      cells: (named ? cells.slice(1) : cells).map((cell) => parseSpellCell(cell, allowsAll)),
      ...(named && { level: Number(lead[1]) }),
    };
  });
}

/**
 * Where a paste's rows land on a class's levels (`levels`, by their number): a row naming a level on it, the others a
 * level each after the last (from `startIndex`), their cells from `startColumn` on; a level the class lacks, a spell
 * level past `columns` and an unreadable cell are left out.
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
    const index = row.level === undefined ? next : levels.findIndex(({ level }) => level === row.level);
    next = index + 1;
    const level = levels[index];
    if (!level) return [];
    return row.cells.flatMap((value, offset) => {
      const spellLevel = startColumn + offset;
      return value === undefined || spellLevel >= columns ? [] : [{ levelId: level.id, spellLevel, value }];
    });
  });
}
