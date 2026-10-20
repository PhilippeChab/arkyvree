/**
 * What a class's Spells tab changes before its save: its tables' cells (spells per day, spells known), by level id
 * then spell level, over the tables as saved; the table they show, and the save they make.
 */

import { SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

import type { PlacedCell, SpellCell } from "./spellPaste.ts";

/** A table's totals as saved, by level id then spell level ("All" for every spell known). */
export type SavedSpellTotals = ReadonlyMap<string, Record<string, number | "All">>;

/** A table's cells the tab changed and hasn't saved: by level id, then by spell level. */
export type SpellEdits = Record<SpellTable, Record<string, Record<number, SpellCell>>>;

/** The spell tables a class has: its spells per day and its spells known (the spells it picks). */
export type SpellTable = "known" | "perDay";

/** A tab that changed nothing yet. */
export const NO_SPELL_EDITS: SpellEdits = { known: {}, perDay: {} };

/** A total as a cell holds it: none, a count, or "all". */
export function readSpellCell(total: number | "All" | undefined): SpellCell {
  if (total === undefined) return null;
  return total === "All" ? "all" : total;
}

/**
 * A Spells tab's tables (`saved`, over the class's `levels` in order) with its edits (`edits`): each cell as it shows,
 * Spells Known's every spell, once a level knows them all, known at every level after it; what a write makes of it;
 * and the save it makes, a row a level it changes.
 */
export class SpellDraft {
  constructor(
    private readonly levels: readonly { id: string }[],
    readonly saved: Record<SpellTable, SavedSpellTotals>,
    readonly edits: SpellEdits,
  ) {
    this.indexById = new Map(levels.map((level, index) => [level.id, index]));
    this.firstAll = SPELL_LEVELS.map((spellLevel) =>
      levels.findIndex(({ id }) => this.editedCell("known", id, spellLevel) === "all"),
    );
  }

  /** Each spell level's first level whose spells known are all of them: -1 for none. */
  private readonly firstAll: number[];

  private readonly indexById: Map<string, number>;

  /** A cell as the edits hold it: an emptied cell's edit is `null`, which holds over the saved value as a count does. */
  private editedCell(which: SpellTable, levelId: string, spellLevel: number): SpellCell {
    const row = this.edits[which][levelId];
    return row && spellLevel in row ? row[spellLevel] : this.savedCell(which, levelId, spellLevel);
  }

  /** The rows a table's save sends: each level it changes, with every spell level's cell. */
  private rowsOf(which: SpellTable) {
    return this.levels.flatMap(({ id }) =>
      SPELL_LEVELS.some((spellLevel) => this.cellOf(which, id, spellLevel) !== this.savedCell(which, id, spellLevel))
        ? [{ levelId: id, counts: SPELL_LEVELS.map((spellLevel) => this.cellOf(which, id, spellLevel)) }]
        : [],
    );
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
    // A spell level the class knows spells of reads 0 a day at least, as its saved table does
    if (which === "perDay" && cell === null) {
      const known = this.cellOf("known", levelId, spellLevel);
      if (known === "all" || (typeof known === "number" && known > 0)) return 0;
    }
    return cell;
  }

  /** The cells of a write (`cells`) that change the table as it shows. */
  changesOf(which: SpellTable, cells: PlacedCell[]) {
    const next = new SpellDraft(this.levels, this.saved, this.write(which, cells));
    return cells.filter(
      ({ levelId, spellLevel }) => next.cellOf(which, levelId, spellLevel) !== this.cellOf(which, levelId, spellLevel),
    );
  }

  /** How many of a table's cells show other than saved. */
  countChanged(which: SpellTable) {
    return this.levels.flatMap(({ id }) =>
      SPELL_LEVELS.filter((spellLevel) => this.cellOf(which, id, spellLevel) !== this.savedCell(which, id, spellLevel)),
    ).length;
  }

  /** Whether a cell's spells are all known from an earlier level: it shows All, whatever it holds. */
  isKnownAbove(which: SpellTable, levelId: string, spellLevel: number) {
    const allFrom = this.firstAll[spellLevel] ?? -1;
    return which === "known" && allFrom !== -1 && (this.indexById.get(levelId) ?? 0) > allFrom;
  }

  /** A cell as saved. */
  savedCell(which: SpellTable, levelId: string, spellLevel: number) {
    return readSpellCell(this.saved[which].get(levelId)?.[spellLevel]);
  }

  /**
   * The edits once a table's `cells` are written: on Spells Known, a cell under an All keeps no edit of its own, and a
   * count written over a column's first All goes down to the levels saved All by it (not those with a count, nor past
   * an All of their own), so the All is gone, not moved.
   */
  write(which: SpellTable, cells: PlacedCell[]): SpellEdits {
    const next = { ...this.edits[which] };
    const place = (levelId: string, spellLevel: number, value: SpellCell) => {
      next[levelId] = { ...next[levelId], [spellLevel]: value };
    };
    for (const { levelId, spellLevel, value } of cells) {
      place(levelId, spellLevel, value);
      const first = this.levels[this.firstAll[spellLevel] ?? -1];
      if (which !== "known" || value === "all" || first?.id !== levelId) continue;
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
    if (which === "perDay") return written;
    const draft = new SpellDraft(this.levels, this.saved, written);
    for (const spellLevel of SPELL_LEVELS) {
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
