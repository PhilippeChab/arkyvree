import type { FormField } from "@/engine/core/fields/index.ts";
import type { CharacterForm } from "@/engine/core/module/parts/characters/index.ts";

/**
 * How a kind's row copies an entity (an item's): a duplicate, whose form keeps the columns it can't change (`locked`:
 * an item's type, slot and template), and variants, the most at once (`most`), each its own name and description. A
 * copy names the template it's from in its `source` column: a template's own, its `template` column true, or the
 * entity's own template; a copy is never a template itself.
 */
export interface EntityCopiesDescription {
  locked: string[];
  most: number;
  source: string;
  template: string;
}

/**
 * An entity kind a ruleset holds (a table of its entities: races, feats), as its ruleset's page shows it: its type
 * (`klasses`), its icon, by the generic name of its picture (`face`, `bolt`: the client's set of them), what its tab
 * says of it, when it says anything (`help`), what its empty list says past its word (`empty`: "No saving throws
 * available for this ruleset."), whether its list narrows by the kinds a race or a class is for and sorts
 * (`partitioned`), whether its entities are the rules' alone, which no form makes, edits or deletes and no search
 * finds (`readOnly`: an ability's), where its row opens (`opens`: its own page, its customization page, or its
 * progression page, a class's), whether its form gives its description room (`longDescription`: a mechanic's), and
 * whether a new one's form says what each of its fields is for (`fieldHelp`: a class's), whether its form shows two
 * fields side by side in a wide dialog (`wideForm`: `fluid`, an item's; `fixed`, its height kept as its fields change,
 * a spell's), the pools its list narrows by (`pools`: the scope of the aptitudes it's picked in, a feat's `feats`),
 * whether its list narrows by a power's level (`levels`: a spell's), whether its list groups an entity's variants under
 * their family (`families`: a feat's), how its row copies one (`copies`: an item's), and when its name can't change
 * (`lockedName`: while its `flag` column holds, a generated feat's, its form saying why, `reason`). Its word is its rules'
 * (`RulesDescription.words`), and its URL's segment the app's (`getUrlSegment`: `classes`). Not the kinds a race or a
 * class is for (`entityKinds`).
 */
export interface EntityKindDescription {
  copies?: EntityCopiesDescription;
  empty?: string;
  families?: boolean;
  fieldHelp?: boolean;
  help?: string;
  icon: string;
  levels?: boolean;
  lockedName?: { flag: string; reason: string };
  longDescription?: boolean;
  opens: "customization" | "page" | "progression";
  partitioned?: boolean;
  pools?: "feats" | "spells";
  readOnly?: boolean;
  type: string;
  wideForm?: "fixed" | "fluid";
}

/**
 * A column of an entity's own value in its type's list, between its name and its description: its key (where its value
 * is in a listed entity, `hd`, `costGp`; or what it shows of it, `template`), its label, its share of the
 * list's width (percent), where a phone shows it (`slot`), and how its value reads (`reads`):
 * - `chip`: a chip of its label (`labels`, by value: a hit die's 10 is "d10"), else of the value;
 * - `muted`: its text, quiet;
 * - `number`, `decimal`: in its `unit` ("30 ft", "15.00 gp"), a decimal with two places;
 * - `reference`: the name of the entity of the ruleset it names (`references`: its kind, `abilities`);
 * - `flag`: a warning's "Yes" while it's `yesWhen` ("Trained Only" while a skill isn't usable untrained), "No" else;
 * - `template`: an item's template's name, or "Template" for a template itself;
 * - `aptitudes`: the pools it's picked in, as chips (its links to them at its key: a spell's `powersAptitudesInRules`);
 * - `text`: its text, as it is (a language's type).
 */
export interface ListColumn {
  key: string;
  label: string;
  labels?: Readonly<Record<string, string>>;
  reads: "aptitudes" | "chip" | "decimal" | "flag" | "muted" | "number" | "reference" | "template" | "text";
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
  /** The bounds of an ability's base score, which its sheet's box raises and lowers it within */
  abilityScores: { max: number; min: number };
  /** A new character's form, as its rules lay it out: its sections, their fields, its ability scores among them */
  characterForm: CharacterForm;
  /**
   * The columns each entity type's form shows beside its name and description, by type, as its rules hold them (a
   * class's hit die, an item's cost, type and slot): each keyed where its value goes in the form's body
   */
  columns: Partial<Record<string, FormField[]>>;
  /** The kinds a race or a class is for: a player character (`pc`), and those its rules add (3.5's bonded creatures) */
  entityKinds: { label: string; value: string }[];
  /**
   * The entity kinds its rulesets hold (races, feats), in the order their ruleset's page shows them as its tabs; not
   * the kinds a race or a class is for (`entityKinds`)
   */
  kinds: EntityKindDescription[];
  /** A class's last level */
  lastClassLevel: number;
  /**
   * What a system ruleset's content is licensed under, under its header (`text`: the license whose text the app
   * serves): none where nothing needs saying
   */
  license?: { notice: string; text: "ogl" };
  /** Each entity type's list on its ruleset's page, by type: its columns of the entities' own values */
  lists: Partial<Record<string, ListDescription>>;
  /** The levels a power has, each with its name ("Cantrips", "Level 1") */
  powerLevels: { label: string; level: number }[];
  /** How a class progresses, as its Progression and Spells tabs set it */
  progression: ProgressionDescription;
  /**
   * Its word for every entity type, by type (3.5's powers are spells), the engine's own types' (`modifiers`) included:
   * every name the app gives an entity's type
   */
  words: Partial<Record<string, RulesWord>>;
}

/** A word in its singular and its plural ("Spell", "Spells"). */
export interface RulesWord {
  many: string;
  one: string;
}
