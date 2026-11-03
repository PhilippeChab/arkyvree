/**
 * Several owned entities made at once (3.5's class levels 6 to 15), as an owner's create dialog lays them out: the
 * positions a create takes, always the owner's next (`listOpenPositions`), how many it may make at once
 * (`listBatchCounts`), what each track starts at (`defaultBatchChoices`), and each owned entity's form, its tracks'
 * values as their choices give them at its position, carrying on from the owned entity below it (`buildOwnedBatch`,
 * `listTrackValues`).
 */

import type { OwnedFormData, OwnedLists, OwnedRead } from "@/client/src/pages/rulesets/components/forms/index.ts";

import type { TrackKey } from "./progressionDraft.ts";
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

/**
 * The owner's owned entities as its tab shows them (`entities`), each track's value at one as it reads it (`read`: its
 * Progression's edits over what's saved), which what a create makes starts and carries on from.
 */
export interface ShownOwned {
  entities: readonly OwnedRead[];
  read: (ownedEntity: OwnedRead, key: TrackKey) => number;
}

/** What a track follows across the owned entities made at once: a preset's key, or a number at every position. */
export type BatchChoice = number | string;

/** How many owned entities a create makes at once: one, as it always could, or a run of them. */
const BATCH_COUNTS = [1, 5, 10, 20];

/** What a new position's track carries on from: the owner's highest owned entity below it, its value as shown. */
function findBase({ entities, read }: ShownOwned, key: TrackKey, position: number) {
  const below = entities.filter((ownedEntity) => ownedEntity.position < position);
  const highest = below.reduce<OwnedRead | undefined>(
    (top, ownedEntity) => (top && top.position > ownedEntity.position ? top : ownedEntity),
    undefined,
  );
  return highest && { position: highest.position, value: read(highest, key) };
}

/**
 * A track's value at a new position, as its choice gives it: what its preset adds from the owner's owned entity below
 * it, so it carries on from that one's value and never drops where the preset changes (a poor base attack bonus after
 * a +15 level 15: +16 at 16, +18 at 20), within the track's bounds; its preset's own value with nothing below it; or
 * the number it sets at every position (its least where it has none).
 */
function valueAt(track: OwnerTrack, choice: BatchChoice | undefined, position: number, shown: ShownOwned) {
  const preset = presetsOf(track.rules).find(({ key }) => key === choice);
  if (!preset) return typeof choice === "number" ? choice : track.rules.min;
  const base = findBase(shown, track.key, position);
  if (!base) return preset.valueAt(position);
  const value = base.value + preset.valueAt(position) - preset.valueAt(base.position);
  return Math.min(Math.max(value, track.rules.min), track.rules.max);
}

/**
 * Each owned entity a create makes at once, at its positions (`positions`, the owner's next: `listOpenPositions`): its
 * position, the fields its tracks set (`tracks`: each its stored field) and its amounts among its links, at its list's
 * role (`lists`: every entity its amounts' tracks are of), each its track's value at its position (`choices`, by
 * track), carrying on from the owner's owned entities as shown (`shown`).
 */
export function buildOwnedBatch(
  positions: readonly number[],
  tracks: readonly OwnerTrack[],
  choices: Readonly<Record<TrackKey, BatchChoice>>,
  { amounts }: OwnedLists,
  shown: ShownOwned,
): OwnedFormData[] {
  const fieldTracks = tracks.filter(({ rules }) => rules.source === "field" && rules.field !== undefined);
  const amountTracks = tracks.filter(({ rules, toId }) => rules.source === "amounts" && toId !== undefined);
  return positions.map((position) => {
    const valueOf = (track: OwnerTrack) => valueAt(track, choices[track.key], position, shown);
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
 * What each track starts at in a create (`tracks`, over the owner's owned entities as its tab shows them, `shown`: its
 * Progression's unsaved edits over what's saved): the preset its values follow at the most positions, as its Custom
 * editor reads them (`findNearestPreset`), its first for an owner without owned entities; a track without presets, the
 * highest owned entity's number, else its least.
 */
export function defaultBatchChoices(
  tracks: readonly OwnerTrack[],
  { entities: ownedEntities, read }: ShownOwned,
): Record<TrackKey, BatchChoice> {
  const highest = ownedEntities.at(-1);
  return Object.fromEntries(
    tracks.map((track) => {
      const presets = presetsOf(track.rules);
      const values = ownedEntities.map((owned) => ({ position: owned.position, value: read(owned, track.key) }));
      if (presets.length > 0) return [track.key, findNearestPreset(presets, values).key];
      return [track.key, highest ? read(highest, track.key) : track.rules.min];
    }),
  );
}

/**
 * How many owned entities a create may make at once, of the positions open to it (`open`: `listOpenPositions`'s): one,
 * five, ten or twenty, each cut to how many are open, the same count once; none once the owner has them all.
 */
export function listBatchCounts(open: number): number[] {
  return [...new Set(BATCH_COUNTS.map((count) => Math.min(count, open)))].filter((count) => count >= 1);
}

/**
 * The positions a create takes, in the order it takes them (`taken`, the owner's own): those the owner lacks up to its
 * rules' last (`lastPosition`: 3.5's level 20), a gap's first, so its next is always the lowest it lacks; while the
 * rules load, that one alone.
 */
export function listOpenPositions(taken: readonly number[], lastPosition: number | undefined): number[] {
  const held = new Set(taken);
  const last = lastPosition ?? Math.max(0, ...taken) + 1;
  const open = Array.from({ length: last }, (_, index) => index + 1).filter((position) => !held.has(position));
  return lastPosition === undefined ? open.slice(0, 1) : open;
}

/**
 * A track's values at new positions (`positions`) as a choice gives them (`choice`), carrying on from the owner's owned
 * entities as shown (`shown`), as a create makes them: what its dialog says a choice gives.
 */
export function listTrackValues(
  track: OwnerTrack,
  choice: BatchChoice | undefined,
  positions: readonly number[],
  shown: ShownOwned,
) {
  return positions.map((position) => valueAt(track, choice, position, shown));
}
