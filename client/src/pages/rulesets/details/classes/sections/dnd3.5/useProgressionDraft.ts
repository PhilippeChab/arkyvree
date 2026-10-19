import { useState } from "react";

import type { ClassLevelRow } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import {
  type FeatureRow,
  NO_EDITS,
  type PoolRow,
  type ProgressionEdits,
  readTrack,
  type TrackKey,
} from "./progressionDraft.ts";

/**
 * A class's Progression tab's changes before its save (`edits`), over its levels as saved: a value set back to the
 * saved one drops its edit, so the tab holds only what differs. They're the class's (`classId`): once the page follows
 * a copy of it, whose levels are others, it holds none.
 */
export function useProgressionDraft(classId: string, levels: readonly ClassLevelRow[]) {
  const [draft, setDraft] = useState<{ classId: string; edits: ProgressionEdits }>({ classId, edits: NO_EDITS });
  const edits = draft.classId === classId ? draft.edits : NO_EDITS;
  const setEdits = (change: (current: ProgressionEdits) => ProgressionEdits) =>
    setDraft((current) => ({ classId, edits: change(current.classId === classId ? current.edits : NO_EDITS) }));
  const levelById = new Map(levels.map((level) => [level.id, level]));

  /** A track's new values, by level id: each one equal to the saved value forgets its edit. */
  const setTrack = (key: TrackKey, values: Record<string, number>) =>
    setEdits((current) => {
      const track = { ...current.tracks[key] };
      for (const [levelId, value] of Object.entries(values)) {
        const level = levelById.get(levelId);
        if (level && readTrack(level, key) === value) delete track[levelId];
        else track[levelId] = value;
      }
      return { ...current, tracks: { ...current.tracks, [key]: track } };
    });

  /** The levels a feature is granted at, by their ids. */
  const setFeatureLevels = (row: FeatureRow, levelIds: string[]) =>
    setEdits((current) => ({ ...current, features: { ...current.features, [row.key]: levelIds } }));

  /** A pool's picks at a level. */
  const setPoolPick = (aptitudeId: string, levelId: string, count: number) =>
    setEdits((current) => ({
      ...current,
      pools: { ...current.pools, [aptitudeId]: { ...current.pools[aptitudeId], [levelId]: count } },
    }));

  /** A feature the class doesn't grant yet, granted at no level until one is picked. */
  const addFeature = (row: FeatureRow) =>
    setEdits((current) =>
      current.addedFeatures.some((added) => added.key === row.key)
        ? current
        : { ...current, addedFeatures: [...current.addedFeatures, row] },
    );

  /** A pool the class's levels give no picks in yet. */
  const addPool = (pool: PoolRow) =>
    setEdits((current) =>
      current.addedPools.some((added) => added.aptitudeId === pool.aptitudeId)
        ? current
        : { ...current, addedPools: [...current.addedPools, pool] },
    );

  return {
    addFeature,
    addPool,
    discard: () => setEdits(() => NO_EDITS),
    edits,
    setFeatureLevels,
    setPoolPick,
    setTrack,
  };
}
