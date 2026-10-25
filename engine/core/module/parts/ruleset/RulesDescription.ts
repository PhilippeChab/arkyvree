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
 * (`classes`), its icon, by the generic name of its picture (`face`, `bolt`: the client's set of them), what its tab
 * says of it, when it says anything (`help`), what its empty list says past its word (`empty`: "No saving throws
 * available for this ruleset."), whether its list narrows by the kinds a race or a class is for and sorts
 * (`partitioned`), whether its entities are the rules' alone, which no form makes, edits or deletes and no search finds
 * (`readOnly`: an ability's), where its row opens (`opens`: its own page, its customization page, or its progression
 * page, a class's), whether its form gives its description room (`longDescription`: a mechanic's), and whether a new
 * one's form says what each of its fields is for (`fieldHelp`: a class's), whether its form shows two fields side by
 * side in a wide dialog (`wideForm`: `fluid`, an item's; `fixed`, its height kept as its fields change, a spell's), the
 * pools its list narrows by (`pools`), the entities its page links one to (`links`: a class's skills), whether its list
 * narrows by a tier (`levels`: a spell's, by its level, `RulesDescription.tiers`), whether its list groups an entity's
 * variants under their family (`families`: a feat's), how its row copies one (`copies`: an item's), and when its name
 * can't change (`lockedName`: while its `flag` column holds, a generated feat's, its form saying why, `reason`). Its
 * word is its rules' (`RulesDescription.words`), and its URL's segment the app's (`getUrlSegment`: `classes`). Not the
 * kinds a race or a class is for (`entityKinds`).
 */
export interface EntityKindDescription {
  copies?: EntityCopiesDescription;
  empty?: string;
  families?: boolean;
  fieldHelp?: boolean;
  help?: string;
  icon: string;
  levels?: boolean;
  links?: EntityLinksDescription;
  lockedName?: { flag: string; reason: string };
  longDescription?: boolean;
  opens: "customization" | "page" | "progression";
  partitioned?: boolean;
  pools?: EntityPoolsDescription;
  readOnly?: boolean;
  type: string;
  wideForm?: "fixed" | "fluid";
}

/**
 * The entities an entity's page links it to, one at a time, by a role of its links (`/links`: a class's skills), on a
 * tab of their own: their kind (`type`: 3.5's `skills`), the role of its links (`role`: `classSkill`, which names their
 * activities: `addClassSkill`), each answered with the entity it's from (`fromId`, a copy's where an edit of an
 * inherited one copied it), its target (`toId`) and its target's name (`toName`), and where an activity of one holds
 * the linked entity's name (`targetName`: `skillName`).
 */
export interface EntityLinksDescription {
  role: string;
  targetName: string;
  type: string;
}

/**
 * The pools a kind's list narrows by, one at a time: their kind (`type`: 3.5's `aptitudes`), those of them its entities
 * are picked in (`scope`, which its list's picker searches: a feat's `feats`, a spell's `spells`), the key its list's
 * query takes one by (`key`: `aptitudeId`), and the URL's (`param`: `aptitude`).
 */
export interface EntityPoolsDescription {
  key: string;
  param: string;
  scope: string;
  type: string;
}

/**
 * A column of an entity's own value in its type's list, between its name and its description: its key (where its value
 * is in a listed entity, `hd`, `costGp`; its `links`; or what it shows of it, `template`), its label, its share of the
 * list's width (percent), where a phone shows it (`slot`), and how its value reads (`reads`):
 * - `chip`: a chip of its label (`labels`, by value: a hit die's 10 is "d10"), else of the value;
 * - `muted`: its text, quiet;
 * - `number`, `decimal`: in its `unit` ("30 ft", "15.00 gp"), a decimal with two places;
 * - `reference`: the name of the entity of the ruleset it names (`references`: its kind, `abilities`);
 * - `flag`: a warning's "Yes" while it's `yesWhen` ("Trained Only" while a skill isn't usable untrained), "No" else;
 * - `template`: an item's template's name, or "Template" for a template itself;
 * - `pools`: the pools it's picked in, as chips by name (its links of a `role`, at its key: a spell's `listedIn`
 *   links, each its pool's name at `toName`);
 * - `text`: its text, as it is (a language's type).
 */
export interface ListColumn {
  key: string;
  label: string;
  labels?: Readonly<Record<string, string>>;
  reads: "chip" | "decimal" | "flag" | "muted" | "number" | "pools" | "reference" | "template" | "text";
  references?: string;
  role?: string;
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
 * What a class's tables count (3.5's spells), and how its page reads and saves them: their kind (`type`: `spells`),
 * the key a progression's save sends its tables' cells by (`body`: `spells`), the keys a progression's answer says by
 * which list its counts go to (`list`: `spellList`) and whether its levels count on several (`several`:
 * `severalSpellLists`), the class's table of its lists (`lists`: `spell-lists`), the URLs of its tables' tab (`tab`:
 * `spells`) and of its list's (`listTab`: `spell-list`), and what its tables' tab says of a class with no list
 * (`none`), to an editor (how a class gets one) and to a viewer, the class's name at `{class}` and its tables' labels
 * at `{tables}`.
 */
export interface ProgressionCounts {
  body: string;
  list: string;
  lists: string;
  listTab: string;
  none: { editor: string; viewer: string };
  several: string;
  tab: string;
  type: string;
}

/**
 * How a class's levels progress, as its page sets them: its last level (`lastLevel`), its class table's tracks
 * (`tracks`, each a column its Progression tab sets), the label of its column of what a level grants (`grantsLabel`:
 * its features and feat pools), its tables (`tables`, which its tables' tab edits: none where its classes count
 * none) and what they count (`counts`), what its levels grant past their columns (`grants`), and the tabs its page had
 * before, by the address each one now opens (`tabAliases`: 3.5's Feat Pools tab's, its Progression).
 */
export interface ProgressionDescription {
  counts?: ProgressionCounts;
  grants?: ProgressionGrants;
  grantsLabel: string;
  lastLevel: number;
  tabAliases: Record<string, string>;
  tables: ProgressionTable[];
  tracks: ProgressionTrack[];
}

/**
 * What a class's levels grant, past their own columns (its levels' `grants` field: 3.5's feats, each through a feat
 * pool), as its Progression tab shows them: the pools a level gives picks in, of a kind and its scope (`pools`: 3.5's
 * `aptitudes`, of `feats`), where a progression's answer holds the picks a granted entity gives in its pools (`picks`:
 * `featPicks`), the class's table of each level's totals by pool (`table`: `feat-pools`, at `totals`: `featPools`), and
 * the words its card and its failures say them in (`words`).
 */
export interface ProgressionGrants {
  picks: string;
  pools: { scope: string; type: string };
  table: string;
  totals: string;
  words: {
    add: string;
    addPool: string;
    feature: string;
    help: string;
    pool: string;
    pools: string;
    title: string;
    totals: string;
  };
}

/**
 * A table a class's tables' tab edits (3.5's spells per day, spells known), by the key its save takes it by (`perDay`,
 * `known`): its label and what it's for, the class's table it's read from (`table`: `spells`) and where a level's row
 * holds its totals (`totals`: `spellsPerDay`), a cell's most (`max`), the word for every value of a column, which the
 * levels after it keep (`all`: none for a table without), the table whose opening of a column makes this one's emptied
 * cell read 0 (`zeroWhereOpenedBy`), and its columns (a spell level each), each with the words a pasted table's header
 * names it by (`aliases`).
 */
export interface ProgressionTable {
  all?: string;
  columns: { aliases: string[]; key: string; label: string }[];
  help?: string;
  key: string;
  label: string;
  max: number;
  table: string;
  totals: string;
  zeroWhereOpenedBy?: string;
}

/**
 * A column of a class's table its Progression tab sets: where a level holds it (`source`: one of its fields, by `key`,
 * or its amounts, by `key`, one per entity of a kind: 3.5's base per save of the ruleset), its labels (the table's
 * `shortLabel`, the value's `unitLabel` when one number sets every level), its bounds, each value's label from `min`
 * (`labels[value - min]`: none reads it as it is), and the progressions it follows (`presets`: each its value at each
 * level, from the first).
 */
export interface ProgressionTrack {
  key: string;
  label: string;
  labels?: string[];
  max: number;
  min: number;
  presets: { key: string; label: string; values: number[] }[];
  shortLabel?: string;
  source: "amounts" | "field";
  unitLabel?: string;
}

/**
 * What a base rules' rulesets share, past any ruleset's view: what the app calls their entities, the columns their
 * forms show, the kinds a race or a class is for, how a class progresses, a listed entity's tiers, and the license a
 * system ruleset's content is under. The client reads it once, for every base rules, and holds none of it.
 */
export interface RulesDescription {
  /** A new character's form, as its rules lay it out: its sections, their fields, its ability scores among them */
  characterForm: CharacterForm;
  /**
   * The columns each entity type's form shows beside its name and description, by type, as its rules hold them (a
   * class's hit die, an item's cost, type and slot): each keyed where its value goes in the form's body
   */
  columns: Partial<Record<string, FormField[]>>;
  /**
   * The kinds whose customizations have a page of their own, as its storage declares them customizable (3.5's feats,
   * items, spells, races and class levels), an owned kind's with the kind that owns it (`owner`: a class level's
   * class) and the key its rows name it at (`ownerKey`: `klassId`); not a kind that owns another, whose customizations
   * are its page's tabs (a class's)
   */
  customizationPages: { owner?: string; ownerKey?: string; type: string }[];
  /** The kinds a race or a class is for: a player character (`pc`), and those its rules add (3.5's bonded creatures) */
  entityKinds: { label: string; value: string }[];
  /**
   * The help its pages give in its own terms, which name what its characters have (3.5's strength, skills, feats): a
   * customization's tabs' (`modifiers`, `requirements`), its ruleset's Settings tab's (`settings`), and a condition's
   * template's examples of paths (`templateExamples`)
   */
  help: { modifiers: string; requirements: string; settings: string; templateExamples: string };
  /**
   * The entity kinds its rulesets hold (races, feats), in the order their ruleset's page shows them as its tabs; not
   * the kinds a race or a class is for (`entityKinds`)
   */
  kinds: EntityKindDescription[];
  /**
   * What a system ruleset's content is licensed under, under its header (`text`: the license whose text the app
   * serves): none where nothing needs saying
   */
  license?: { notice: string; text: "ogl" };
  /** Each entity type's list on its ruleset's page, by type: its columns of the entities' own values */
  lists: Partial<Record<string, ListDescription>>;
  /** How a class progresses, as its Progression and Spells tabs set it */
  progression: ProgressionDescription;
  /**
   * The tiers an entity has on a list that ranks it, each by its level with its name (3.5's spell levels: "Cantrips",
   * "Level 1"), which the lists of a kind that narrows by them (`EntityKindDescription.levels`) offer
   */
  tiers: { label: string; level: number }[];
  /**
   * Its word for every entity type, by type (3.5's "Class Level" for `class_levels`), the engine's own types'
   * (`modifiers`) included: every name the app gives an entity's type
   */
  words: Partial<Record<string, RulesWord>>;
}

/** A word in its singular and its plural ("Spell", "Spells"). */
export interface RulesWord {
  many: string;
  one: string;
}

/** What a module's rules describe of themselves: all but what the engine reads off its storage. */
export type RulesDeclaration = Omit<RulesDescription, "customizationPages">;
