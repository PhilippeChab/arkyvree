import type { FormField } from "@/engine/core/fields/index.ts";
import type { CharacterForm } from "@/engine/core/module/parts/characters/index.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";

/**
 * How a kind's row copies an entity (an item's): a duplicate, whose form keeps the fields it can't change (`locked`,
 * each by the stored field or the role that keeps it: an item's type, slot and template), and variants, the most at
 * once (`most`), each its own name and description. A copy names the template it's from in its `source` link, by its
 * role: a template's own, its own flag (`template.field`) true, or the entity's own template; a copy is never a template
 * itself.
 */
export interface EntityCopiesDescription {
  locked: string[];
  most: number;
  source: string;
  template: { field: string };
}

/**
 * What a module's rules declare of an entity kind its rulesets hold (`EntityKindDescription`): how its page presents
 * it, its type (`type`), its icon, its tab's help, its empty list's words, its form's room and help, and its copies'
 * words (`copies`: a duplicate's locked fields, the most variants at once, of a kind that makes copies). What it can do
 * the engine reads off its rules' class and its storage.
 */
export interface EntityKindDeclaration {
  copies?: Pick<EntityCopiesDescription, "locked" | "most">;
  empty?: string;
  fieldHelp?: boolean;
  help?: string;
  icon: string;
  longDescription?: boolean;
  type: StandaloneKind;
  wideForm?: "fixed" | "fluid";
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
 * narrows by a tier (`levels`: a spell's, by its level, `RulesDescription.tiers`, its query's `tier`), whether its list
 * groups an entity's variants under their family (`families`: a feat's, the field that holds them, its query's filter
 * of that field), how its row copies one (`copies`: an item's), and when its name can't change (`lockedName`: while
 * its own flag `field` holds, a generated feat's, its form saying why, `reason`). Its word is its rules'
 * (`RulesDescription.words`), and its URL's segment its type (`classes`, `class-levels`). Not the kinds a race or a
 * class is for (`entityKinds`).
 */
export interface EntityKindDescription {
  copies?: EntityCopiesDescription;
  empty?: string;
  families?: { field: string };
  fieldHelp?: boolean;
  help?: string;
  icon: string;
  levels?: boolean;
  links?: EntityLinksDescription;
  lockedName?: { field: string; reason: string };
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
 * inherited one copied it), its target (`toId`) and its target's name (`toName`), which an activity of one records as
 * every link's does (`toId`, `toName`).
 */
export interface EntityLinksDescription {
  role: string;
  type: string;
}

/**
 * The pools a kind's list narrows by, one at a time: their kind (`type`: 3.5's `aptitudes`), those of them its entities
 * are picked in (`scope`, which its list's picker searches: a feat's `feats`, a spell's `spells`), the role of its
 * entities' links to them, which its list's query takes one by (`role`: `listedIn`), and the URL's key (`param`:
 * `aptitude`).
 */
export interface EntityPoolsDescription {
  param: string;
  role: string;
  scope: string;
  type: string;
}

/**
 * An entity type's word ("Feat", "Feats"), and an owned type's word for its entity's position along its owner
 * (`position`: 3.5's class level's "Level", which names one "Level 3").
 */
export interface KindWord extends RulesWord {
  position?: RulesWord;
}

/**
 * A column of an entity's own value in its type's list, between its name and its description, by where it's stored
 * (one of the two), which names it in its table too (the client's `listColumnId`): its own field (`field`: among its
 * `fields`, `ITEM_COST_GP`) or its links of a role (`role`: among its `links`, a skill's `keyAbility`, a feat's
 * `listedIn`), its label (its field's, unless its list names it otherwise: a race's "Speed"), its share of the list's
 * width (percent), where a phone shows it (`slot`), what its field's declaration says of its value, which the engine
 * reads off it (`RulesEngine`: a number's `labels` and `unit`, a reference's kind, `references`), and how its value
 * reads (`reads`):
 * - `chip`: a chip of its label (`labels`, by value: a hit die's 10 is "d10"), else of the value;
 * - `muted`: its text, quiet;
 * - `number`, `decimal`: in its `unit` ("30 feet", "15.00 gp"), a decimal with two places;
 * - `reference`: the name of the entity of the ruleset it names (`references`: its kind, `abilities`), its link's
 *   target;
 * - `flag`: a warning's "Yes" while it's `yesWhen` ("Trained Only" while a skill isn't usable untrained), "No" else;
 * - `template`: the name of the template a copy is made from (an item's), its link of its kind's `copies.source` role's
 *   target (`toName`), or "Template" for a template itself (its `field` set);
 * - `pools`: the pools it's picked in, as chips by name (its links of a `role`: a spell's `listedIn` links, each its
 *   pool's name at `toName`);
 * - `text`: its text, as it is (a language's type).
 */
export interface ListColumn {
  field?: string;
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

/**
 * A list's column as a module's rules declare it: what's its own alone, its label only where its list names it
 * otherwise than its field (`label`: shorter, a race's speed's "Speed"; or as its flag reads, a skill's "Trained Only"). The rest its field's declaration says.
 */
export interface ListColumnDeclaration extends Omit<ListColumn, "label" | "labels" | "references" | "unit"> {
  label?: string;
}

/** An entity type's list as a module's rules declare it: its columns' own (`ListColumnDeclaration`). */
export interface ListDeclaration extends Omit<ListDescription, "columns"> {
  columns: ListColumnDeclaration[];
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

/** How a class's levels progress, as a module's rules declare it: its tracks' own (`ProgressionTrackDeclaration`). */
export interface ProgressionDeclaration extends Omit<ProgressionDescription, "tracks"> {
  tracks: ProgressionTrackDeclaration[];
}

/**
 * How a class's levels progress, as its page sets them: its last level (`lastLevel`), its class table's tracks
 * (`tracks`, each a column its Progression tab sets), the label of its column of what a level grants (`grantsLabel`:
 * its features and feat pools), its tables (`tables`, which its tables' tab edits: none where its classes count
 * none) and what they count (`counts`), what its levels grant past their columns (`grants`), and the tabs its page had
 * before, by the address each one now opens (`tabAliases`: 3.5's Feat Pools tab's, its Progression; none for a ruleset
 * whose pages never had others).
 */
export interface ProgressionDescription {
  counts?: ProgressionCounts;
  grants?: ProgressionGrants;
  grantsLabel: string;
  lastLevel: number;
  tabAliases?: Record<string, string>;
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
 * A column of a class's table its Progression tab sets: where a level holds it (`source`: one of its fields, the stored
 * `field` a level's read holds it at, which its form's save gives at `key`; or its amounts, by `key`, one per entity of
 * a kind: 3.5's base per save of the ruleset), its labels (its field's `label`, the table's `shortLabel`, the value's
 * `unitLabel` when one number sets every level), its bounds (its field's `min` and `max`), each value's label from
 * `min` (`labels[value - min]`: none reads it as it is), and the progressions it follows (`presets`: each its value at
 * each level, from the first). Its field is its level's (its `field`, or its list of amounts), whose declaration the
 * engine reads its label and bounds off (`RulesEngine`).
 */
export interface ProgressionTrack {
  field?: string;
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
 * What a module's rules describe of themselves: all but what the engine reads off its storage, its fields'
 * declarations and its imports, of its kinds their presentation alone (`EntityKindDeclaration`), what each can do
 * being its rules' class's and its storage's, and of its lists' columns and its progression's tracks what's their own,
 * what their values are being their fields' declarations'.
 */
export interface RulesDeclaration extends Omit<
  RulesDescription,
  "customizationPages" | "fields" | "importers" | "kinds" | "lists" | "progression"
> {
  kinds: EntityKindDeclaration[];
  lists: Partial<Record<string, ListDeclaration>>;
  progression: ProgressionDeclaration;
}

/**
 * What a base rules' rulesets share, past any ruleset's view: what the app calls their entities, the fields their
 * forms show, the kinds a race or a class is for, how a class progresses, a listed entity's tiers, and the license a
 * system ruleset's content is under. The client reads it once, for every base rules, and holds none of it.
 */
export interface RulesDescription {
  /** A new character's form, as its rules lay it out: its sections, their fields, its ability scores among them */
  characterForm: CharacterForm;
  /**
   * The kinds whose customizations have a page of their own, as its storage declares them customizable (3.5's feats,
   * items, spells, races and class levels), an owned kind's with the kind that owns it (`owner`: a class level's
   * class, its `ownerId`); not a kind that owns another, whose customizations are its page's tabs (a class's)
   */
  customizationPages: { owner?: string; type: string }[];
  /** The kinds a race or a class is for: a player character (`pc`), and those its rules add (3.5's bonded creatures) */
  entityKinds: { label: string; value: string }[];
  /**
   * Each type's fields as its form shows them, by type (an entity type's, `rulesets` a ruleset's Settings'), as its
   * module declares them (`FieldCodec.describe`): each its label, what it's for, its input and where its form shows it
   * (beside its name and description, `placement`; among its other fields; a list of links after them), keyed where
   * its value goes in the form's body (a field's `field`, a link's `role`). A type whose form shows none is left out
   */
  fields: Partial<Record<string, FormField[]>>;
  /**
   * The help its pages give in its own terms, which name what its characters have (3.5's strength, skills, feats): a
   * customization's tabs' (`modifiers`, `requirements`), its ruleset's Settings tab's (`settings`), and a condition's
   * template's examples of paths (`templateExamples`)
   */
  help: { modifiers: string; requirements: string; settings: string; templateExamples: string };
  /**
   * The programs whose files its rulesets import a character from, in the order its importers try them (3.5's PCGen),
   * as its imports declare them: what the import's dialog names before a file is picked
   */
  importers: string[];
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
   * Its word for every entity type, by type (3.5's "Class Level" for `class-levels`), the engine's own types'
   * (`characters`, `modifiers`, `requirements`) included: every name the app gives an entity's type, in a label's
   * Title Case, which its refusals and issues write in a sentence's (`RulesetData.labelOf`: "Class level not found in
   * this ruleset")
   */
  words: Partial<Record<string, KindWord>>;
}

/** A word in its singular and its plural ("Spell", "Spells"). */
export interface RulesWord {
  many: string;
  one: string;
}

/** A column of a class's table as a module's rules declare it: what's its own, its label and bounds its field's. */
export type ProgressionTrackDeclaration = Omit<ProgressionTrack, "label" | "max" | "min">;
