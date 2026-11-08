import type { ProgressionDeclaration } from "@/engine/core/module/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5.2/limits.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd5.2/classes.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd5.2/spells.ts";

import ProgressionLabels from "./ProgressionLabels.ts";

/** What a table in a book heads its level column with, in lower case. */
const POSITION_ALIASES = ["level", "lvl"];

/**
 * How a class progresses in the 2024 rules: its features and feat pools under "Class Features" (its subclass's pick, its
 * Ability Score Improvement, its Fighting Style and Weapon Mastery picks are pools), its spell slots, a column a spell
 * level: what its levels give on its list by then, as its table in the SRD gives them, which a character casting from
 * this class alone has; and its cantrips and prepared spells, a column a spell level: what it prepares by then, a
 * level's new spells counted at the highest level it casts then, which a lower level's spells fill too; and its Pact
 * Magic, its slots and their level by then (a warlock's), shown for a class whose levels give it, in place of its
 * Spell Slots when they give no other (`hiddenTables`). A class's
 * spell list is the aptitude named for it ("Wizard Spells"), which its Spell List tab's first add makes where the
 * ruleset has none. Its levels follow no track: the Proficiency Bonus is the character's, by its level, and its hit
 * points its hit die's.
 */
export const PROGRESSION: ProgressionDeclaration = {
  counts: {
    body: "spells",
    create: "Create {name}",
    hidden: "hiddenTables",
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
      help: "Click a level to grant a feature there. A feature that isn't Stackable is granted once: clicking another level moves it. For a feat pool, click again to change how many picks.",
      pool: "Feat pool",
      pools: "Feat pools",
      repeat: "No effect: a character takes {name} once, at {position}. It isn't Stackable.",
      single: "{name} isn't Stackable, so it's granted at one level: a click moves it here from {position}.",
      title: "Class Features and Feat Pools",
      totals: "Feat pool totals",
    },
  },
  grantsLabel: "Class Features",
  lastPosition: MAX_CLASS_LEVEL,
  // Its Levels and Feat Pools tabs are its Progression's; its spell slots' and its prepared spells', the Spells tab
  tabAliases: {
    "feat-pools": "progression",
    levels: "progression",
    "spells-known": "spells?table=known",
    "spells-per-day": "spells",
  },
  tables: [
    {
      columns: SPELL_LEVELS.slice(1).map((level) => ({
        aliases: ProgressionLabels.listSpellLevelAliases(level),
        key: String(level),
        label: SPELL_LEVEL_LABELS[level],
      })),
      help: "How many spell slots of each level the class has by then.",
      key: "perDay",
      label: "Spell Slots",
      max: RULESET_LIMITS.tableCount,
      positionAliases: POSITION_ALIASES,
      table: "spells",
      totals: "spellsPerDay",
    },
    // Its slots' table, a warlock's in place of its Spell Slots: each class's tab opens on its slots
    {
      columns: [
        { aliases: ["slots", "spell slots"], key: "slots", label: "Slots" },
        { aliases: ["slot level"], key: "level", label: "Slot Level" },
      ],
      help: "How many Pact Magic slots the class has by then, and their level: every slot is of that level.",
      key: "pact",
      label: "Pact Magic",
      max: RULESET_LIMITS.tableCount,
      positionAliases: POSITION_ALIASES,
      table: "pact-magic",
      totals: "pactMagic",
    },
    {
      all: {
        hint: "All Prepared From an Earlier Level",
        lockedPaste:
          "That cell already has every spell from an earlier level. Paste into another cell, or use Paste a Table.",
        word: "All",
      },
      columns: SPELL_LEVELS.map((level) => ({
        aliases: ProgressionLabels.listSpellLevelAliases(level),
        key: String(level),
        label: SPELL_LEVEL_LABELS[level],
      })),
      help: 'How many cantrips and spells the class prepares by then. "All" is every spell of its list.',
      key: "known",
      label: "Cantrips and Prepared Spells",
      max: RULESET_LIMITS.tableCount,
      positionAliases: POSITION_ALIASES,
      table: "spells-known",
      totals: "spellsKnown",
    },
  ],
  tracks: [],
};
