/**
 * Several owned entities made at once (3.5's class levels 6 to 15), as an owner's create dialog lays them out: how many
 * its rules' last position leaves room for (`listBatchCounts`), what each track starts at (`defaultBatchChoices`), and
 * each owned entity's form, its tracks' values as their choices give them at its position (`buildOwnedBatch`).
 */

import type { OwnedFormData, OwnedLists, OwnedRead } from "@/client/src/pages/rulesets/components/forms/index.ts";

import { readTrack, type TrackKey } from "./progressionDraft.ts";
import { findNearestPreset, presetsOf, type ProgressionTrack } from "./progressionPresets.ts";

/**
 * A track an owner's Progression tab sets: its key, its label (an entity's name, for a track of an owned entity's
 * amounts: 3.5's saves), the entity its amounts are of (`toId`), and its rules' track: its bounds, how its values read,
 * and the progressions it can follow.
 */
export interface OwnerTrack {
  key: TrackKey;
  label: string;
  rules: ProgressionTrack;
  toId?: string;
}

/** What a track follows across the owned entities made at once: a preset's key, or a number at every position. */
export type BatchChoice = number | string;

/** How many owned entities a create makes at once: one, as it always could, or a run of them. */
const BATCH_COUNTS = [1, 5, 10, 20];

/**
 * A track's value at a position, as its choice gives it: its preset's there, or the number it sets at every position
 * (its least where it has none).
 */
function valueAt(track: OwnerTrack, choice: BatchChoice | undefined, position: number) {
  const preset = presetsOf(track.rules).find(({ key }) => key === choice);
  if (preset) return preset.valueAt(position);
  return typeof choice === "number" ? choice : track.rules.min;
}

/**
 * Each owned entity a create makes at once, from its first position (`from`), `count` of them: its position, the fields
 * its tracks set (`tracks`: each its stored field) and its amounts among its links, at its list's role (`lists`: every
 * entity its amounts' tracks are of), each its track's value at its position (`choices`, by track).
 */
export function buildOwnedBatch(
  from: number,
  count: number,
  tracks: readonly OwnerTrack[],
  choices: Readonly<Record<TrackKey, BatchChoice>>,
  { amounts }: OwnedLists,
): OwnedFormData[] {
  const fieldTracks = tracks.filter(({ rules }) => rules.source === "field" && rules.field !== undefined);
  const amountTracks = tracks.filter(({ rules, toId }) => rules.source === "amounts" && toId !== undefined);
  return Array.from({ length: count }, (_, index) => {
    const position = from + index;
    const valueOf = (track: OwnerTrack) => valueAt(track, choices[track.key], position);
    return {
      position,
      fields: Object.fromEntries(fieldTracks.map((track) => [track.rules.field, valueOf(track)])),
      ...(amounts &&
        amountTracks.length > 0 && {
          links: { [amounts.role]: amountTracks.map((track) => ({ toId: track.toId ?? "", amount: valueOf(track) })) },
        }),
    };
  });
}

/**
 * What each track starts at in a create of several (`tracks`, over the owner's `ownedEntities` as read): the preset its
 * values follow at the most positions, as its Custom editor reads them (`findNearestPreset`), its first for an owner
 * without owned entities; a track without presets, the highest owned entity's number, else its least.
 */
export function defaultBatchChoices(
  tracks: readonly OwnerTrack[],
  ownedEntities: readonly OwnedRead[],
): Record<TrackKey, BatchChoice> {
  const highest = ownedEntities.at(-1);
  return Object.fromEntries(
    tracks.map((track) => {
      const presets = presetsOf(track.rules);
      const values = ownedEntities.map((owned) => ({ position: owned.position, value: readTrack(owned, track.key) }));
      if (presets.length > 0) return [track.key, findNearestPreset(presets, values).key];
      return [track.key, highest ? readTrack(highest, track.key) : track.rules.min];
    }),
  );
}

/**
 * How many owned entities a create may make at once from a position (`from`): one, five, ten or twenty, each cut to
 * what's left up to the rules' last position (`lastPosition`, its owner's last: 3.5's level 20), the same count once.
 * One alone while the rules load, or from past their last.
 */
export function listBatchCounts(from: number, lastPosition: number | undefined): number[] {
  const left = lastPosition === undefined ? 1 : Math.max(lastPosition - from + 1, 1);
  return [...new Set(BATCH_COUNTS.map((count) => Math.min(count, left)))].filter((count) => count >= 1);
}
