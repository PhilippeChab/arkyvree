import type { ProgressionDeclaration } from "@/engine/core/module/index.ts";
import CombatSheet from "@/engine/rulesets/pf1/characters/description/CombatSheet.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/pf1/limits.ts";
import ClassProgressions from "@/engine/rulesets/pf1/rules/ClassProgressions.ts";
import { formatSigned } from "@/shared/text.ts";
import { BONDED_KIND_SLUGS } from "@/vocabulary/pf1/bondedKinds.ts";
import { type BabType, MAX_CLASS_LEVEL, type SaveType } from "@/vocabulary/pf1/classes.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_RANKS } from "@/vocabulary/pf1/fields/index.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/pf1/spells.ts";

import ProgressionLabels from "./ProgressionLabels.ts";

/** What a class level form's base attack bonus presets read: a label for each of its progressions. */
const BAB_PRESET_LABELS: Record<BabType, string> = { good: "Good (full)", medium: "Medium (¾)", poor: "Poor (½)" };
/** Each of a class's progressions' values at each class level, by how good it is: what its tracks' presets fill. */
const LEVEL_PRESETS = ClassProgressions.describePresets();

/** What a table in a book heads its level column with, in lower case. */
const POSITION_ALIASES = ["level", "lvl"];
/** What a class level form's save presets read: a label for each of their progressions. */
const SAVE_PRESET_LABELS: Record<SaveType, string> = { good: "Good", poor: "Poor" };

/**
 * How a Pathfinder class progresses: its base attack bonus (as the sheet writes it, "+6/+1"; good, medium or poor, a point
 * every so many levels), its saves (signed; good or poor, a base and a point every so many levels), its skill points,
 * its features under "Special", and its spells per day and spells known, a column a spell level, Spells Known's "All"
 * carrying down. A class's spell list is the aptitude named for it ("Wizard Spells"), which its Spell List tab's first
 * add makes where the ruleset has none. A bonded creature's class has no base attack bonus, saves or skill points
 * (their `omittedFor`: `BONDED_KIND_SLUGS`): its sheet works them out from its master or its hit dice, and its levels
 * follow its master's, spending no skill points, so they hold none and its table leaves them out.
 */
export const PROGRESSION: ProgressionDeclaration = {
  counts: {
    body: "spells",
    create: "Create {name}",
    list: "spellList",
    lists: "spell-lists",
    listTab: "spell-list",
    ownList: "ownSpellList",
    none: {
      editor: "{ownerName} has no spell list yet.",
      viewer: "{ownerName} casts no spells.",
    },
    refusal: "spellTablesRefusal",
    several: "severalSpellLists",
    tab: "spells",
    type: "spells",
  },
  grants: {
    featuresFilter: "grantableBy",
    maxPicks: RULESET_LIMITS.tableCount,
    offeredPools: "offeredPools",
    picks: "featPicks",
    pools: { scope: "feats", type: "aptitudes" },
    notes: "featureNotes",
    table: "feat-pools",
    totals: "featPools",
    words: {
      add: "Add Class Feature",
      addPool: "Add Feat Pool",
      create: "Create {name}",
      feature: "Class feature",
      help: "A filled level grants the feature there. A feature that isn't Stackable is granted at one level: clicking another moves it there. A feat pool's filled level gives picks in it: click it again to change how many.",
      pool: "Feat pool",
      pools: "Feat pools",
      repeat: "No effect: a character takes {name} once, at {position}. It isn't Stackable.",
      single: "{name} isn't Stackable, so it's granted at one level: a click moves it here from {position}.",
      title: "Class Features and Feat Pools",
      totals: "Feat pool totals",
    },
  },
  grantsLabel: "Special",
  lastPosition: MAX_CLASS_LEVEL,
  // Its Levels and Feat Pools tabs are its Progression's; Spells Known's, the Spells tab on its table
  tabAliases: {
    "feat-pools": "progression",
    levels: "progression",
    "spells-known": "spells?table=known",
    "spells-per-day": "spells",
  },
  tables: [
    {
      columns: SPELL_LEVELS.map((level) => ({
        aliases: ProgressionLabels.listSpellLevelAliases(level),
        key: String(level),
        label: SPELL_LEVEL_LABELS[level],
      })),
      key: "perDay",
      label: "Spells per Day",
      max: RULESET_LIMITS.tableCount,
      table: "spells",
      totals: "spellsPerDay",
      positionAliases: POSITION_ALIASES,
    },
    {
      all: {
        hint: "All Known From an Earlier Level",
        lockedPaste: "That cell knows every spell from an earlier level: paste into an open cell, or Paste a Table",
        word: "All",
      },
      columns: SPELL_LEVELS.map((level) => ({
        aliases: ProgressionLabels.listSpellLevelAliases(level),
        key: String(level),
        label: SPELL_LEVEL_LABELS[level],
      })),
      help: "How many spells the class picks at each spell level by then: a wizard's spellbook, a sorcerer's spells known. \"All\" is every spell of its list.",
      key: "known",
      label: "Spells Known",
      max: RULESET_LIMITS.tableCount,
      positionAliases: POSITION_ALIASES,
      table: "spells-known",
      totals: "spellsKnown",
    },
  ],
  tracks: [
    {
      field: CLASS_LEVEL_BAB,
      key: "bab",
      omittedFor: BONDED_KIND_SLUGS,
      labels: ProgressionLabels.listLabels(RULESET_LIMITS.classLevel, (bab) => CombatSheet.formatBab(bab)),
      presets: ProgressionLabels.listPresets(BAB_PRESET_LABELS, LEVEL_PRESETS.bab),
      shortLabel: "BAB",
      source: "field",
    },
    {
      key: "saves",
      omittedFor: BONDED_KIND_SLUGS,
      labels: ProgressionLabels.listLabels(RULESET_LIMITS.saveBase, (base) => formatSigned(base)),
      presets: ProgressionLabels.listPresets(SAVE_PRESET_LABELS, LEVEL_PRESETS.saves),
      source: "amounts",
    },
    {
      field: CLASS_LEVEL_SKILL_RANKS,
      key: "skills",
      omittedFor: BONDED_KIND_SLUGS,
      presets: [],
      source: "field",
      unitLabel: "Points a Level",
    },
  ],
};
