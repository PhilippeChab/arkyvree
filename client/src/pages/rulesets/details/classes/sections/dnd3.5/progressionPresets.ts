/** The 3.5 rules' progressions a class's base attack bonus and saves follow, as its Progression tab offers them. */

import { formatSigned } from "@/shared/text.ts";
import { BAB_PROGRESSIONS, SAVE_PROGRESSIONS } from "@/vocabulary/dnd3.5/classes.ts";
import { COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";

/** A track's value at one of its class's levels, and the level's id. */
export interface LevelValue extends TrackValue {
  levelId: string;
}

/** A progression a track can follow: its name, its label, and its value at each class level. */
export interface ProgressionPreset {
  key: string;
  label: string;
  valueAt: (level: number) => number;
}

/** A track's value at one of its class's levels. */
export interface TrackValue {
  level: number;
  value: number;
}

/** The base attack bonus progressions: a good one's as fast as its level, a medium one's ¾ of it, a poor one's ½. */
export const BAB_PRESETS: ProgressionPreset[] = [
  {
    key: "good",
    label: "Good (full)",
    valueAt: (level) => Math.floor((level * BAB_PROGRESSIONS.good.points) / BAB_PROGRESSIONS.good.levels),
  },
  {
    key: "medium",
    label: "Medium (¾)",
    valueAt: (level) => Math.floor((level * BAB_PROGRESSIONS.medium.points) / BAB_PROGRESSIONS.medium.levels),
  },
  {
    key: "poor",
    label: "Poor (½)",
    valueAt: (level) => Math.floor((level * BAB_PROGRESSIONS.poor.points) / BAB_PROGRESSIONS.poor.levels),
  },
];

/** A save's progressions: a good one's base plus one every two levels, a poor one's one every three. */
export const SAVE_PRESETS: ProgressionPreset[] = [
  {
    key: "good",
    label: "Good",
    valueAt: (level) => SAVE_PROGRESSIONS.good.base + Math.floor(level / SAVE_PROGRESSIONS.good.hitDicePerPoint),
  },
  {
    key: "poor",
    label: "Poor",
    valueAt: (level) => SAVE_PROGRESSIONS.poor.base + Math.floor(level / SAVE_PROGRESSIONS.poor.hitDicePerPoint),
  },
];

/** The levels at which a track's values differ from a preset's. */
export function countPresetDifferences(preset: ProgressionPreset, values: readonly TrackValue[]) {
  return values.filter(({ level, value }) => preset.valueAt(level) !== value).length;
}

/** The preset a track's values follow at every level it has, if one does (none for a class without levels). */
export function detectPreset(presets: readonly ProgressionPreset[], values: readonly TrackValue[]) {
  if (values.length === 0) return undefined;
  return presets.find((preset) => countPresetDifferences(preset, values) === 0);
}

/** The preset a track's values follow at the most levels: the one its Custom editor greys the others after. */
export function findNearestPreset(presets: readonly ProgressionPreset[], values: readonly TrackValue[]) {
  return presets.reduce((best, preset) =>
    countPresetDifferences(preset, values) < countPresetDifferences(best, values) ? preset : best,
  );
}

/** A base attack bonus as the sheet writes it, an attack a round each step down above 0: "+16/+11/+6/+1". */
export function formatBab(bab: number) {
  const attacks = [bab];
  while (attacks.at(-1)! > COMBAT_RULES.ATTACK_STEP) attacks.push(attacks.at(-1)! - COMBAT_RULES.ATTACK_STEP);
  return attacks.map((attack) => formatSigned(attack)).join("/");
}
