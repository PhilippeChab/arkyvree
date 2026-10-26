/** The progressions an owner's tracks follow, as its rules describe them and its Progression tab offers them. */

import type { RulesProgression } from "@/client/src/lib/queries.ts";

/** A track's value at one of its owner's levels, and the level's id. */
export interface LevelValue extends TrackValue {
  levelId: string;
}

/** A progression a track can follow: its name, its label, and its value at each level. */
export interface ProgressionPreset {
  key: string;
  label: string;
  valueAt: (level: number) => number;
}

/** A track's value at one of its owner's levels. */
export interface TrackValue {
  level: number;
  value: number;
}

/** A column of an owner's table its Progression tab sets, as its rules describe it. */
export type ProgressionTrack = RulesProgression["tracks"][number];

/** The levels at which a track's values differ from a preset's. */
export function countPresetDifferences(preset: ProgressionPreset, values: readonly TrackValue[]) {
  return values.filter(({ level, value }) => preset.valueAt(level) !== value).length;
}

/** The preset a track's values follow at every level it has, if one does (none for an owner without levels). */
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

/** A track's value as its rules write it ("+6/+1", "+2"): as it is past its labels. */
export function formatTrackValue(track: ProgressionTrack, value: number) {
  return track.labels?.[value - track.min] ?? String(value);
}

/** A track's presets as its rules give them, each its value at a level, the last level's past its values. */
export function presetsOf(track: ProgressionTrack): ProgressionPreset[] {
  return track.presets.map(({ key, label, values }) => ({
    key,
    label,
    valueAt: (level) => values[Math.min(Math.max(level, 1), values.length) - 1] ?? 0,
  }));
}
