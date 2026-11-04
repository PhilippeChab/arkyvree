import type { OwnedRead } from "@/client/src/pages/rulesets/components/forms/index.ts";

import {
  type FeatureRow,
  NO_EDITS,
  type PoolRow,
  type ProgressionEdits,
  readTrack,
  type TrackKey,
  withoutFeature,
  withoutPool,
} from "./progressionDraft.ts";
import { useOwnerDraft } from "./useOwnerDraft.ts";

/**
 * An owner's Progression tab's changes before its save (`edits`), over its owned entities as saved: a value set back to
 * the saved one drops its edit, so the tab holds only what differs. They're the owner's (`ownerId`, `useOwnerDraft`'s),
 * kept while the page shows another tab, with the tokens they began over (`tokens`); `changed` says whether they change
 * anything.
 */
export function useProgressionDraft(
  ownerId: string,
  ownedEntities: readonly OwnedRead[],
  fresh: boolean,
  changed: (edits: ProgressionEdits) => boolean,
) {
  const { discard, edits, forgetTokens, setEdits, settle, tokens } = useOwnerDraft<ProgressionEdits>(
    ownerId,
    "progression",
    ownedEntities,
    fresh,
    NO_EDITS,
    changed,
  );
  const ownedById = new Map(ownedEntities.map((ownedEntity) => [ownedEntity.id, ownedEntity]));

  /** A track's new values, by owned entity id: each one equal to the saved value forgets its edit. */
  const setTrack = (key: TrackKey, values: Record<string, number>) =>
    setEdits((current) => {
      const track = { ...current.tracks[key] };
      for (const [ownedId, value] of Object.entries(values)) {
        const ownedEntity = ownedById.get(ownedId);
        if (ownedEntity && readTrack(ownedEntity, key) === value) delete track[ownedId];
        else track[ownedId] = value;
      }
      return { ...current, tracks: { ...current.tracks, [key]: track } };
    });

  /** The owned entities a feature is granted at, by their ids. */
  const setFeatureGrantedAt = (row: FeatureRow, ownedIds: string[]) =>
    setEdits((current) => ({ ...current, features: { ...current.features, [row.key]: ownedIds } }));

  /** A pool's picks at an owned entity. */
  const setPoolPick = (poolId: string, ownedId: string, count: number) =>
    setEdits((current) => ({
      ...current,
      pools: { ...current.pools, [poolId]: { ...current.pools[poolId], [ownedId]: count } },
    }));

  /** A feature the owner doesn't grant yet, granted at no owned entity until one is picked. */
  const addFeature = (row: FeatureRow) =>
    setEdits((current) =>
      current.addedFeatures.some((added) => added.key === row.key)
        ? current
        : { ...current, addedFeatures: [...current.addedFeatures, row] },
    );

  /** A feature taken off the owner (`withoutFeature`). */
  const removeFeature = (row: FeatureRow) => setEdits((current) => withoutFeature(current, row));

  /** A pool taken off the owner (`withoutPool`). */
  const removePool = (pool: PoolRow) => setEdits((current) => withoutPool(current, pool));

  /** A pool the owner's owned entities give no picks in yet. */
  const addPool = (pool: PoolRow) =>
    setEdits((current) =>
      current.addedPools.some((added) => added.id === pool.id)
        ? current
        : { ...current, addedPools: [...current.addedPools, pool] },
    );

  return {
    addFeature,
    addPool,
    discard,
    edits,
    forgetTokens,
    removeFeature,
    removePool,
    setFeatureGrantedAt,
    setPoolPick,
    setTrack,
    settle,
    tokens,
  };
}
