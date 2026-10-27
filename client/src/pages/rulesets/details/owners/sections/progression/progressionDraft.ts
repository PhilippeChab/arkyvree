/**
 * What an owner's Progression tab changes before its save: its tracks' values (a level's fields its rules set, its
 * amounts: 3.5's saves), its features' levels and its pools' picks, by level id, over the owner as saved; and the save
 * they make, each level's fields by stored field and its amounts and grants among its links, at its lists' roles.
 */

import type { LevelLists, LevelRead } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { OwnerProgressionBody } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";

/**
 * A feature the owner grants (3.5's feat, `toId`, through a feat pool, `viaId`), and the levels it grants it at, by
 * their ids.
 */
export interface FeatureRow {
  key: string;
  levelIds: string[];
  name: string;
  toId: string;
  viaId: string;
  viaName: string | null;
}

/** A pool the owner's levels give picks in, and how many each gives, by its id. */
export interface PoolRow {
  id: string;
  name: string;
  picks: Record<string, number>;
}

/** What the tab changed and hasn't saved: each track's, feature's and pool's new values, and the rows it added. */
export interface ProgressionEdits {
  addedFeatures: FeatureRow[];
  addedPools: PoolRow[];
  /** A feature's levels, by its key */
  features: Record<string, string[]>;
  /** A pool's picks, by its id, then by level id */
  pools: Record<string, Record<string, number>>;
  /** A track's values, by its key, then by level id */
  tracks: Partial<Record<TrackKey, Record<string, number>>>;
}

/** A track the Progression tab edits: a level's field, by its key (3.5's `bab`), or an amount (`amount:<id>`). */
export type TrackKey = string;

/** An amount's track's key's prefix. */
const AMOUNT_TRACK = "amount:";

/** A tab that changed nothing yet. */
export const NO_EDITS: ProgressionEdits = { addedFeatures: [], addedPools: [], features: {}, pools: {}, tracks: {} };

/** Whether two lists of level ids hold the same levels. */
function sameLevels(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** An amount's track's key, by the entity it's of. */
export function amountTrackKey(entityId: string): TrackKey {
  return `${AMOUNT_TRACK}${entityId}`;
}

/**
 * The save a tab's edits make (`edits`, over the owner's `levels`, `features` and `pools` as saved): each level's
 * fields its tracks set (`fieldTracks`: each its stored field, by its track's key), and its amounts and grants among
 * its links, at its lists' roles (`lists`), of the ruleset's entities its amounts are of (`amountIds`: 3.5's
 * saves; none while they load, the level's own then, never an empty list); each pool's picks by the pool's `id`.
 */
export function buildProgressionBody(
  levels: readonly LevelRead[],
  lists: LevelLists,
  fieldTracks: readonly { field: string; key: string }[],
  amountIds: readonly string[] | undefined,
  features: readonly FeatureRow[],
  pools: readonly PoolRow[],
  edits: ProgressionEdits,
): Omit<OwnerProgressionBody, "ownedTokens"> {
  const rows = withAddedFeatures(features, edits);
  const savedLevelIds = new Set(levels.map((level) => level.id));
  const levelsOf = (row: FeatureRow) => edits.features[row.key] ?? row.levelIds;
  const valueOf = (level: LevelRead, key: TrackKey) => readEditedTrack(level, key, edits);
  const grantOf = (row: FeatureRow, level: LevelRead) =>
    level.grants.find((grant) => describeFeatureKey(grant) === row.key);
  // A grant keeps whether it's free; a new one is as its feature's first grant, or free for a new feature
  const freeOf = (row: FeatureRow, level: LevelRead) =>
    (grantOf(row, level) ?? levels.map((other) => grantOf(row, other)).find(Boolean))?.free ?? true;
  const levelEdits = levels.flatMap((level) => {
    // The ruleset's entities, as a level's form sends their amounts; until they're read, the level's own
    const levelAmountIds = amountIds ?? level.amounts.map((amount) => amount.toId);
    const trackKeys: TrackKey[] = [
      ...fieldTracks.map(({ key }) => key),
      ...levelAmountIds.map((id) => amountTrackKey(id)),
    ];
    const tracksChanged = trackKeys.some((key) => valueOf(level, key) !== readTrack(level, key));
    const granted = rows.filter((row) => levelsOf(row).includes(level.id));
    const grantsChanged = !sameLevels(
      granted.map((row) => row.key),
      features.filter((row) => row.levelIds.includes(level.id)).map((row) => row.key),
    );
    if (!tracksChanged && !grantsChanged) return [];
    const { amounts, grants } = lists;
    return [
      {
        levelId: level.id,
        fields: Object.fromEntries(fieldTracks.map(({ field, key }) => [field, valueOf(level, key)])),
        links: {
          ...(amounts && {
            [amounts.role]: levelAmountIds.map((toId) => ({ toId, amount: valueOf(level, amountTrackKey(toId)) })),
          }),
          ...(grants &&
            grantsChanged && {
              [grants.role]: granted.map((row) => ({ toId: row.toId, viaId: row.viaId, free: freeOf(row, level) })),
            }),
        },
      },
    ];
  });
  const poolEdits = withAddedPools(pools, edits).flatMap((pool) => {
    // A level gone since its pick was made takes none
    const picks = Object.entries(edits.pools[pool.id] ?? {})
      .filter(([levelId, count]) => savedLevelIds.has(levelId) && count !== (pool.picks[levelId] ?? 0))
      .map(([levelId, count]) => ({ levelId, count }));
    return picks.length > 0 && lists.grants ? [{ id: pool.id, picks }] : [];
  });
  return {
    ...(levelEdits.length > 0 && { levels: levelEdits }),
    ...(poolEdits.length > 0 && { pools: poolEdits }),
  };
}

/** A feature's key: its entity (`toId`), and the one it's granted through (a feat can be granted in several pools). */
export function describeFeatureKey({ toId, viaId }: { toId: string; viaId: string }) {
  return `${toId}-${viaId}`;
}

/**
 * The features the owner's levels grant, each with the levels it's granted at: by the first of them, then by name,
 * one an entity and the one it's granted through (3.5's feat and its pool).
 */
export function describeFeatureRows(levels: readonly LevelRead[]): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const level of levels.toSorted((a, b) => a.position - b.position)) {
    for (const grant of level.grants) {
      const key = describeFeatureKey(grant);
      const row = rows.get(key) ?? {
        key,
        levelIds: [],
        name: grant.toName,
        toId: grant.toId,
        viaId: grant.viaId,
        viaName: grant.viaName,
      };
      row.levelIds.push(level.id);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** A track's value at a level, as the tab shows it: its edit's, or the saved one. */
export function readEditedTrack(level: LevelRead, key: TrackKey, edits: ProgressionEdits) {
  return edits.tracks[key]?.[level.id] ?? readTrack(level, key);
}

/** A track's value at a level, as saved: 0 for an entity the level has no amount of, or a field with no number. */
export function readTrack(level: LevelRead, key: TrackKey) {
  if (key.startsWith(AMOUNT_TRACK))
    return level.amounts.find((amount) => amountTrackKey(amount.toId) === key)?.amount ?? 0;
  const value = level.values[key];
  return typeof value === "number" ? value : 0;
}

/** A track's value as typed (`text`): a whole number, 0 at least, or `undefined` for anything else. */
export function readWholeNumber(text: string) {
  // An amount may show signed (3.5's save, "+4"): typed so, it's the same number
  const digits = text.trim().replace(/^\+/, "");
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

/** The features as saved, then those the edits add that a save hasn't made the owner's yet. */
export function withAddedFeatures(features: readonly FeatureRow[], edits: ProgressionEdits): FeatureRow[] {
  return [...features, ...edits.addedFeatures.filter((added) => !features.some((row) => row.key === added.key))];
}

/** The pools as saved, then those the edits add that a save hasn't made the owner's yet. */
export function withAddedPools(pools: readonly PoolRow[], edits: ProgressionEdits): PoolRow[] {
  return [...pools, ...edits.addedPools.filter((added) => !pools.some((pool) => pool.id === added.id))];
}
