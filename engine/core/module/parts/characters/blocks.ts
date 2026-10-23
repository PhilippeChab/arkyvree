/**
 * A character's sheet as a list of typed blocks, in its module's order, each titled in its words: the shapes every
 * ruleset's sheet is made of, which the client renders a component each, whatever the game. A ruleset maps its sheet
 * onto them (3.5's ability scores and saving throws are `scores`, its combat and weapon sets `stats`).
 */

import type { SheetStat } from "./descriptions.ts";

/** What every block has: its key, unique on its sheet, its title, and what it says with nothing to show. */
interface BlockHead {
  empty: string;
  key: string;
  title: string;
}

/**
 * A block of scores in boxes, side by side (`scores`): each its label over its value, and the lines that make it up.
 * `edit`: its bases are the character's own, which its owner raises and lowers within their bounds, each written under
 * its score's key, with the words the edit says: a lower base's confirmation (it may break what the character took) and
 * its failure. (Its write is the character's ability scores' today, which a later step names by its block.)
 */
export interface ScoresBlock extends BlockHead {
  edit?: { failed: string; lower: { confirm: string; message: string; title: string } };
  kind: "scores";
  scores: SheetScore[];
}

/**
 * A table's column, as a sheet's table lays it out: its label and width, its alignment, and where a phone shows its
 * cells (`slot`: the row's name, its end, under them, or under them labeled). `hideEmpty`: an empty cell shows nothing
 * on a phone, and a dash from `sm` up; `noWrap`: its cells keep to one line.
 */
export interface SheetColumn {
  align?: "center" | "right";
  hideEmpty?: boolean;
  key: string;
  label: string;
  noWrap?: boolean;
  slot: "inline" | "labeled" | "primary" | "trailing";
  width?: string;
}

/**
 * A table's row: its cells by their columns' keys, as the rules write them (an empty one, `""`, is none). Its name's
 * cell (its `primary` column's) may carry a caption, in parentheses under it, and an alert under that ("Not
 * Proficient (-4)").
 */
export interface SheetRow {
  alert?: string;
  caption?: string;
  cells: Record<string, string>;
  key: string;
}

/**
 * A score in its box: its label and its short one (a compact box's), its value (`signed`: written with its sign), a
 * badge under it (a modifier, toned by its sign), and the parts that make it up ("Misc: +0"). `base`: the part that's
 * the character's own, which its block's edit sets within its bounds; shown first among its parts.
 */
export interface SheetScore {
  badge?: number;
  base?: { label: string; max: number; min: number; value: number };
  key: string;
  label: string;
  parts: SheetStat[];
  short: string;
  signed?: boolean;
  value: number;
}

/**
 * A table on a sheet: its columns and rows, and what it says with no rows (`empty`). `minWidth`: the least width it
 * scrolls within from `sm` up.
 */
export interface SheetTable {
  columns: SheetColumn[];
  empty: string;
  minWidth: number;
  rows: SheetRow[];
}

/**
 * A line of stats, then panels under it (`stats`). A panel has a heading (and a note after it), compact boxes, and a
 * table. 3.5's combat line, then its weapon sets, each with its armor class and its attacks. `empty`: what it says with
 * no panels.
 */
export interface StatsBlock extends BlockHead {
  kind: "stats";
  panels: StatsPanel[];
  stats: SheetStat[];
}

/** A panel of a `stats` block: its heading (none for a block's one panel), its compact boxes, and its table. */
export interface StatsPanel {
  boxes?: SheetStat[];
  heading?: { label: string; note?: string };
  key: string;
  table?: SheetTable;
}

/** A block of a character's sheet, by its kind. */
export type SheetBlock = ScoresBlock | StatsBlock;
