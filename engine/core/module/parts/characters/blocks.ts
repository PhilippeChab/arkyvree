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
 * A block of entities the character holds, of a kind (`entityType`, whose pages their names link to): each its name, a
 * count when it's held more than once, its description and its details (a creature it bonds: `subsheet`); and those
 * granted apart (`granted`, under its label). 3.5's feats and special abilities.
 */
export interface EntriesBlock extends BlockHead {
  entityType: string;
  entries: SheetEntry[];
  granted?: { entries: SheetEntry[]; label: string };
  kind: "entries";
}

/**
 * The character's own fields (`fields`): its portrait (`portrait`, its label: the block a sheet opens with alone has
 * one), then lines of fields (`lines`, laid out a line each, side by side), the fields under them, each its own line
 * (`fields`), its picked links (`links`: each one's role, what its picker says, and the entities it has: 3.5's
 * languages), and its notes, its private ones only for a reader who reads them. A field's key is the name its edit
 * sends it by (`FieldsRequest`); what an edit says (`saved`, `failed`). A sheet opens with its first; any other reads
 * as the sheet does. 3.5's identity; a partly seen character's, its race and physical traits alone.
 */
export interface FieldsBlock extends BlockHead {
  failed: string;
  fields: SheetField[];
  kind: "fields";
  lines: SheetField[][];
  links?: { label: string; none: string; picked: { id: string; name: string }[]; role: string }[];
  notes?: { notes: string; privateNotes?: string };
  portrait?: string;
  saved: string;
}

/**
 * The items a character holds (`inventory`), of a kind (`entityType`, whose pages their names link to): each entry its
 * item's name and description, where it's held (`slot`, none unplaced), how many, its weight and cost in the block's
 * units, whether it's held in use (`held`) and its charges; then the load they make (`load`: its figures, each its
 * label, its short one for a box and its weight, and its status past what's light, as grave as it is). `itemFields`:
 * the fields of its kind's entities their cost and weight are (among an item's own `fields`), which its add dialog
 * shows each item's by; `units`: how its figures read ("5.00 lbs", a box's "1 lb"); `words`: what its table, its
 * dialogs and its toasts say.
 */
export interface InventoryBlock extends BlockHead {
  entityType: string;
  itemFields: { cost: string; weight: string };
  kind: "inventory";
  load?: {
    figures: { label: string; short: string; weight: number | null }[];
    status: { label: string; tone: "error" | "info" | "warning" } | null;
  };
  rows: InventoryRow[];
  units: { cost: SheetUnit; weight: SheetUnit };
  words: InventoryWords;
}

/**
 * An entry of an `inventory` block: its key (the entry's), its item's id, name and description, where it's held, how
 * many, its weight and cost as its item gives them, whether it's held in use, and its charges, if it has any.
 */
export interface InventoryRow {
  charges?: { remaining: number | null; total: number };
  cost: number | null;
  description: string | null;
  held: boolean;
  id: string;
  key: string;
  name: string;
  quantity: number | null;
  slot: string | null;
  weight: number | null;
}

/** What an `inventory` block's table, its add, edit and remove dialogs, their fields and their toasts say. */
export interface InventoryWords {
  add: string;
  added: string;
  addTitle: string;
  charges: string;
  columns: { description: string; item: string; quantity: string; slot: string; value: string; weight: string };
  create: string;
  createHint: string;
  editTitle: string;
  group: string;
  groupRequired: string;
  groups: string;
  handSlot: string;
  inventory: string;
  item: string;
  itemRequired: string;
  items: string;
  notEquipped: string;
  quantityRequired: string;
  remainingCharges: string;
  remove: { confirm: string; message: string; title: string };
  removed: string;
  removeFailed: string;
  saveFailed: string;
  search: string;
  slot: string;
  slotWarning: string;
  totalCharges: string;
  unknown: string;
  updated: string;
  warnings: string;
}

/**
 * A block of entities by pool and tier (`pools`), of a kind (`entityType`, whose pages their names link to): each pool
 * its name and its tiers, each tier its label, a note after it (what it allows: "3/day") and its entries, laid out by
 * `columns`; and the counts each pool's tiers allow (`counts`: its title, the head of its pools' column, the tiers it
 * counts and each pool's counts, none where a tier has none). 3.5's spells, known and per day.
 */
export interface PoolsBlock extends BlockHead {
  columns: SheetColumn[];
  counts?: { corner: string; lists: { counts: (string | null)[]; name: string }[]; tiers: string[]; title: string };
  entityType: string;
  kind: "pools";
  pools: SheetPool[];
}

/**
 * A block of scores in boxes, side by side (`scores`): each its label over its value, and the lines that make it up.
 * `edit`: its bases are the character's own amounts of a scored link (`role`: 3.5's ability scores), which its owner
 * raises and lowers within their bounds, each written under its score's key, with the words the edit says: a lower
 * base's confirmation (it may break what the character took) and its failure.
 */
export interface ScoresBlock extends BlockHead {
  edit?: { failed: string; lower: { confirm: string; message: string; title: string }; role: string };
  kind: "scores";
  scores: SheetScore[];
}

/**
 * A table's column, as a sheet's table lays it out: its label and width, its alignment, and where a phone shows its
 * cells (`slot`: the row's name, its end, under them, or under them labeled). `hideEmpty`: an empty cell shows nothing
 * on a phone, and a dash from `sm` up (`noDash`: nothing there either); `noWrap`: its cells keep to one line; `strong`:
 * its cells in bold (a total's).
 */
export interface SheetColumn {
  align?: "center" | "right";
  hideEmpty?: boolean;
  key: string;
  label: string;
  noDash?: boolean;
  noWrap?: boolean;
  slot: "inline" | "labeled" | "primary" | "trailing";
  strong?: boolean;
  width?: string;
}

/**
 * An entity a block lists: its id (none for one its page can't open), its name, how many the character holds when it
 * counts more than one, its description, and the creature it bonds (`subsheet`), shown in its details.
 */
export interface SheetEntry {
  count?: number;
  description: string | null;
  id: string | null;
  key: string;
  name: string;
  subsheet?: Subsheet;
}

/** A pool of a `pools` block: its name and its tiers, each its label, its note and its entries. */
export interface SheetPool {
  key: string;
  name: string;
  tiers: { entries: PoolEntry[]; key: string; label: string; note?: string }[];
}

/**
 * A table's row: its cells by their columns' keys, as the rules write them (an empty one, `""`, is none). Its name's
 * cell (its `primary` column's) may carry a caption, in parentheses under it, and an alert under that ("Not
 * Proficient (-4)"). In a grouped table, the family it may share with others (`group`), and its name within it
 * (`short`), which it shows under its group's header.
 */
export interface SheetRow {
  alert?: string;
  caption?: string;
  cells: Record<string, string>;
  group?: string;
  key: string;
  short?: string;
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
 * scrolls within from `sm` up; `fixed`: its columns sized as given, its number columns' headers smaller; `grouped`: the
 * rows of a family two or more share under a header that shows or hides them (`SheetRow.group`), a family's rows next
 * to one another, and none with a caption or an alert. Its name is its `primary` column's.
 */
export interface SheetTable {
  columns: SheetColumn[];
  empty: string;
  fixed?: boolean;
  grouped?: boolean;
  minWidth: number;
  rows: SheetRow[];
}

/** A unit a figure reads in: its word after one ("lb") and after any other amount ("lbs"). */
export interface SheetUnit {
  many: string;
  one: string;
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

/**
 * A creature the character bonds, as its entry's details show it: its id and name, its scores in compact boxes, its
 * stats (compact boxes, then columns of label/value lines), and its entries' names as chips (none: no chips' heading),
 * each under its title.
 */
export interface Subsheet {
  chips: { names: string[]; title: string };
  id: string;
  name: string;
  scores: { scores: SheetScore[]; title: string };
  stats: { boxes?: SheetStat[]; columns: { key: string; lines: SheetStat[] }[]; title: string };
}

/** A table block (`table`): a note above its table. 3.5's skills. */
export interface TableBlock extends BlockHead {
  kind: "table";
  note?: string;
  table: SheetTable;
}

/**
 * An entry of a pool's tier: its id, its cells by the block's columns' keys, its tags (each its name and tone), and its
 * details, shown under it once opened: label/value lines, and its description.
 */
export type PoolEntry = Pick<SheetEntry, "id" | "key"> & {
  cells: Record<string, string>;
  description: string;
  details: SheetStat[];
  tags: { name: string; tone: "primary" | "secondary" }[];
};

/** A block of a character's sheet, by its kind. */
export type SheetBlock =
  | EntriesBlock
  | FieldsBlock
  | InventoryBlock
  | PoolsBlock
  | ScoresBlock
  | StatsBlock
  | TableBlock;

/**
 * A field of a `fields` block, by its kind (its key a plain name, none of those its block's form keeps for itself:
 * `notes`, `privateNotes`, `links`): a line of text (`fixed`: never edited, its value the rules' own: a 3.5 character's
 * race), a whole number at least `min` (`required`: what its edit says without one; else it may be cleared), one of a
 * select's options (none: not set), or several lines of text (`placeholder`: what it says empty).
 */
export type SheetField = { key: string; label: string } & (
  | { fixed?: boolean; kind: "text"; value: string }
  | { kind: "number"; min: number; required?: string; value: number | null }
  | { kind: "select"; options: string[]; value: string | null }
  | { kind: "textarea"; placeholder: string; value: string }
);
