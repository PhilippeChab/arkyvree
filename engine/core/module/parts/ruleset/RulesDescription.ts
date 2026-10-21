import type { FormField } from "@/engine/core/fields/index.ts";

/**
 * A column of an entity's own value in its type's list, between its name and its description: its key (where its value
 * is in a listed entity, `hd`, `costGp`; or what it shows of it, `template`, `aptitudes`), its label, its share of the
 * list's width (percent), where a phone shows it (`slot`), and how its value reads (`reads`):
 * - `chip`: a chip of its label (`labels`, by value: a hit die's 10 is "d10"), else of the value;
 * - `muted`: its text, quiet;
 * - `number`, `decimal`: in its `unit` ("30 ft", "15.00 gp"), a decimal with two places;
 * - `reference`: the name of the entity of the ruleset it names (`references`: its kind, `abilities`);
 * - `flag`: a warning's "Yes" while it's `yesWhen` ("Trained Only" while a skill isn't usable untrained), "No" else;
 * - `template`: an item's template's name, or "Template" for a template itself;
 * - `aptitudes`: a power's pools, as chips.
 */
export interface ListColumn {
  key: string;
  label: string;
  labels?: Readonly<Record<string, string>>;
  reads: "aptitudes" | "chip" | "decimal" | "flag" | "muted" | "number" | "reference" | "template";
  references?: string;
  share: number;
  slot?: "block" | "inline";
  unit?: string;
  yesWhen?: boolean;
}

/** An entity type's list: its name's share of its width (percent), and its columns after it, its description's last. */
export interface ListDescription {
  columns: ListColumn[];
  nameShare: number;
}

/**
 * How a class's levels progress, as its page sets them: its class table's tracks (`tracks`, each a column its
 * Progression tab sets), the label of its column of what a level grants (`grantsLabel`: its features and feat pools),
 * and its spell tables (`tables`, which its Spells tab edits: none where its classes cast none), and the name of the
 * aptitude a class's spell list is, its class's name at `{class}` (`spellListName`).
 */
export interface ProgressionDescription {
  grantsLabel: string;
  spellListName?: string;
  tables: ProgressionTable[];
  tracks: ProgressionTrack[];
}

/**
 * A spell table a class's Spells tab edits, by the key its save takes it by (`perDay`, `known`): its label and what
 * it's for, a cell's most (`max`), the word for every value of a column, which the levels after it keep (`all`: none
 * for a table without), the table whose opening of a column makes this one's emptied cell read 0 (`zeroWhereOpenedBy`),
 * and its columns (a spell level each), each with the words a pasted table's header names it by (`aliases`).
 */
export interface ProgressionTable {
  all?: string;
  columns: { aliases: string[]; key: string; label: string }[];
  help?: string;
  key: "known" | "perDay";
  label: string;
  max: number;
  zeroWhereOpenedBy?: "known" | "perDay";
}

/**
 * A column of a class's table its Progression tab sets: where a level holds it (`source`: one of its fields, by `key`,
 * or a base per save of the ruleset, `saves`), its labels (the table's `shortLabel`, the value's `unitLabel` when one
 * number sets every level), its bounds, each value's label from `min` (`labels[value - min]`: none reads it as it is),
 * and the progressions it follows (`presets`: each its value at each level, from the first).
 */
export interface ProgressionTrack {
  key: string;
  label: string;
  labels?: string[];
  max: number;
  min: number;
  presets: { key: string; label: string; values: number[] }[];
  shortLabel?: string;
  source: "field" | "saves";
  unitLabel?: string;
}

/**
 * What a base rules' rulesets share, past any ruleset's view: what the app calls their entities, the columns their
 * forms show, the kinds a race or a class is for, a class's last level, a power's levels, and the license a system
 * ruleset's content is under. The client reads it once, for every base rules, and holds none of it.
 */
export interface RulesDescription {
  /**
   * The columns each entity type's form shows beside its name and description, by type, as its rules hold them (a
   * class's hit die, an item's cost, type and slot): each keyed where its value goes in the form's body
   */
  columns: Partial<Record<string, FormField[]>>;
  /** The kinds a race or a class is for: a player character (`pc`), and those its rules add (3.5's bonded creatures) */
  entityKinds: { label: string; value: string }[];
  /** A class's last level */
  lastClassLevel: number;
  /**
   * What a system ruleset's content is licensed under, under its header (`text`: the license whose text the app
   * serves): none where nothing needs saying
   */
  license?: { notice: string; text: "ogl" };
  /** Each entity type's list on its ruleset's page, by type: its columns of the entities' own values */
  lists: Partial<Record<string, ListDescription>>;
  /** The most variants of an item its form makes at once */
  maxItemVariants: number;
  /** The levels a power has, each with its name ("Cantrips", "Level 1") */
  powerLevels: { label: string; level: number }[];
  /** How a class progresses, as its Progression and Spells tabs set it */
  progression: ProgressionDescription;
  /** Its words for the entity types whose word isn't the engine's, by type: 3.5's powers are spells */
  words: Partial<Record<string, RulesWord>>;
}

/** A word in its singular and its plural ("Spell", "Spells"). */
export interface RulesWord {
  many: string;
  one: string;
}
