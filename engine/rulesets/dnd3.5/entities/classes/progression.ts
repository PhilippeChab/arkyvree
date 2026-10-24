import type { ProgressionDescription } from "@/engine/core/module/index.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import { formatSigned } from "@/shared/text.ts";
import { BAB_PROGRESSIONS, MAX_CLASS_LEVEL, SAVE_PROGRESSIONS } from "@/vocabulary/dnd3.5/classes.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

import ProgressionLabels from "./ProgressionLabels.ts";

/** A class's levels, from the first to the last, as a preset's values go. */
const CLASS_LEVELS = Array.from({ length: RULESET_LIMITS.classLevel }, (_, index) => index + 1);

/**
 * How a 3.5 class progresses: its base attack bonus (as the sheet writes it, "+6/+1"; good, medium or poor, a point
 * every so many levels), its saves (signed; good or poor, a base and a point every so many levels), its skill points,
 * its features under "Special", and its spells per day and spells known, a column a spell level, Spells Known's
 * "All" carrying down. A class's spell list is the aptitude named for it ("Wizard Spells").
 */
export const PROGRESSION: ProgressionDescription = {
  grantsLabel: "Special",
  lastLevel: MAX_CLASS_LEVEL,
  listName: "{class} Spells",
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
      zeroWhereOpenedBy: "known",
    },
    {
      all: "All",
      columns: SPELL_LEVELS.map((level) => ({
        aliases: ProgressionLabels.listSpellLevelAliases(level),
        key: String(level),
        label: SPELL_LEVEL_LABELS[level],
      })),
      help: "How many spells the class picks at each spell level by then: a wizard's spellbook, a sorcerer's spells known. \"All\" is every spell of its list.",
      key: "known",
      label: "Spells Known",
      max: RULESET_LIMITS.tableCount,
    },
  ],
  tracks: [
    {
      key: "bab",
      label: "Base Attack Bonus",
      // A full base attack bonus's at the last level: one never outruns its level
      labels: ProgressionLabels.listLabels(RULESET_LIMITS.classLevel, (bab) => CombatSheet.formatBab(bab)),
      max: RULESET_LIMITS.classLevel,
      min: 0,
      presets: [
        { key: "good", label: "Good (full)", progression: BAB_PROGRESSIONS.good },
        { key: "medium", label: "Medium (¾)", progression: BAB_PROGRESSIONS.medium },
        { key: "poor", label: "Poor (½)", progression: BAB_PROGRESSIONS.poor },
      ].map(({ key, label, progression }) => ({
        key,
        label,
        values: CLASS_LEVELS.map((level) => Math.floor((level * progression.points) / progression.levels)),
      })),
      shortLabel: "BAB",
      source: "field",
    },
    {
      key: "saves",
      label: "Saves",
      labels: ProgressionLabels.listLabels(RULESET_LIMITS.saveBase, (base) => formatSigned(base)),
      max: RULESET_LIMITS.saveBase,
      min: 0,
      presets: [
        { key: "good", label: "Good", progression: SAVE_PROGRESSIONS.good },
        { key: "poor", label: "Poor", progression: SAVE_PROGRESSIONS.poor },
      ].map(({ key, label, progression }) => ({
        key,
        label,
        values: CLASS_LEVELS.map((level) => progression.base + Math.floor(level / progression.hitDicePerPoint)),
      })),
      source: "amounts",
    },
    {
      key: "skills",
      label: "Skill Points",
      max: RULESET_LIMITS.tableCount,
      min: 0,
      presets: [],
      source: "field",
      unitLabel: "Points a Level",
    },
  ],
};
