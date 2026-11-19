/** The progressions an owner's tracks follow, as its rules describe them and its Progression tab offers them. */

import type { RulesProgression } from "@/client/src/lib/queries.ts";

/** A track's value at one of its owner's owned entities, and the owned entity's id. */
export interface OwnedValue extends TrackValue {
  ownedId: string;
}

/** A progression a track can follow: its name, its label, and its value at each position. */
export interface ProgressionPreset {
  key: string;
  label: string;
  valueAt: (position: number) => number;
}

/** A track's value at a position. */
export interface TrackValue {
  position: number;
  value: number;
}

/** A column of an owner's table its Progression tab sets, as its rules describe it. */
export type ProgressionTrack = RulesProgression["tracks"][number];

/** How many of a track's values differ from a preset's. */
export function countPresetDifferences(preset: ProgressionPreset, values: readonly TrackValue[]) {
  return values.filter(({ position, value }) => preset.valueAt(position) !== value).length;
}

/**
 * The preset a track's values follow at every position it has, if one does (none for an owner without owned
 * entities).
 */
export function detectPreset(presets: readonly ProgressionPreset[], values: readonly TrackValue[]) {
  if (values.length === 0) return undefined;
  return presets.find((preset) => countPresetDifferences(preset, values) === 0);
}

/** The preset a track's values follow at the most positions: the one its Custom editor greys the others after. */
export function findNearestPreset(presets: readonly ProgressionPreset[], values: readonly TrackValue[]) {
  return presets.reduce((best, preset) =>
    countPresetDifferences(preset, values) < countPresetDifferences(best, values) ? preset : best,
  );
}

/** A track's value as its rules write it ("+6/+1", "+2"): as it is past its labels. */
export function formatTrackValue(track: ProgressionTrack, value: number) {
  return track.labels?.[value - track.min] ?? String(value);
}

/** Whether a track's tab sets it at `position`: not past the level its rules stop it at (`beyond`: 3.5's 20th). */
export function isTrackSetAt(track: ProgressionTrack, position: number) {
  return !track.beyond || position <= track.beyond.position;
}

/** A track's presets as its rules give them, each its value at a position, the last position's past its values. */
export function presetsOf(track: ProgressionTrack): ProgressionPreset[] {
  return track.presets.map(({ key, label, values }) => ({
    key,
    label,
    valueAt: (position) => values[Math.min(Math.max(position, 1), values.length) - 1] ?? 0,
  }));
}

/**
 * A track's value at `position` as its table shows it: past the level its rules stop it at (`beyond`), its value there
 * (`valueAt`) and the bonus a character of `position` has (a 3.5 Barbarian 21's base attack bonus: its 20th's +20 and
 * the epic +1); its own (`own`) elsewhere, or where it has no value there.
 */
export function readShownTrack(
  track: ProgressionTrack,
  position: number,
  own: number,
  valueAt: (position: number) => number | undefined,
) {
  if (!track.beyond || isTrackSetAt(track, position)) return own;
  const base = valueAt(track.beyond.position);
  return base === undefined ? own : base + (track.beyond.bonuses[position - track.beyond.position - 1] ?? 0);
}
