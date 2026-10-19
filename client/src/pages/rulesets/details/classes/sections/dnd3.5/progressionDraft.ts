/**
 * What a class's Progression tab changes before its save: its tracks' values (base attack bonus, skill points, saves),
 * its features' levels and its pools' picks, by level id, over the class as saved; and the save they make.
 */

import type {
  ClassLevelRow,
  ClassProgression,
  ClassProgressionBody,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

/** A feature the class grants, and the levels it grants it at, by their ids. */
export interface FeatureRow {
  aptitudeId: string;
  aptitudeName: string | null;
  featId: string;
  key: string;
  levelIds: string[];
  name: string;
}

/** A pool the class's levels give picks in, and how many each gives, by its id. */
export interface PoolRow {
  aptitudeId: string;
  name: string;
  picks: Record<string, number>;
}

/** What the tab changed and hasn't saved: each track's, feature's and pool's new values, and the rows it added. */
export interface ProgressionEdits {
  addedFeatures: FeatureRow[];
  addedPools: PoolRow[];
  /** A feature's levels, by its key */
  features: Record<string, string[]>;
  /** A pool's picks, by its aptitude's id, then by level id */
  pools: Record<string, Record<string, number>>;
  /** A track's values, by its key, then by level id */
  tracks: Partial<Record<TrackKey, Record<string, number>>>;
}

/** A track the Progression tab edits: the base attack bonus, the skill points, or a save (`save:<id>`). */
export type TrackKey = "bab" | "skills" | `save:${string}`;

/** A tab that changed nothing yet. */
export const NO_EDITS: ProgressionEdits = { addedFeatures: [], addedPools: [], features: {}, pools: {}, tracks: {} };

/** Whether two lists of level ids hold the same levels. */
function sameLevels(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * The save a tab's edits make (`edits`, over the class's `levels`, `features` and `pools` as saved), each level's
 * with the ruleset's saves (`saveIds`: none while they load, the level's own then, never an empty list).
 */
export function buildProgressionBody(
  levels: readonly ClassLevelRow[],
  saveIds: readonly string[] | undefined,
  features: readonly FeatureRow[],
  pools: readonly PoolRow[],
  edits: ProgressionEdits,
): Omit<ClassProgressionBody, "levelTokens"> {
  const rows = [...features, ...edits.addedFeatures];
  const classLevelIds = new Set(levels.map((level) => level.id));
  const levelsOf = (row: FeatureRow) => edits.features[row.key] ?? row.levelIds;
  const valueOf = (level: ClassLevelRow, key: TrackKey) => readEditedTrack(level, key, edits);
  const grantOf = (row: FeatureRow, level: ClassLevelRow) =>
    level.feats.find((feat) => describeFeatureKey({ featId: feat.id, aptitudeId: feat.aptitudeId }) === row.key);
  // A grant keeps whether it's free; a new one is as its feature's first grant, or free for a new feature
  const freeOf = (row: FeatureRow, level: ClassLevelRow) =>
    (grantOf(row, level) ?? levels.map((other) => grantOf(row, other)).find(Boolean))?.free ?? true;
  const levelEdits = levels.flatMap((level) => {
    // The ruleset's saves, as a level's form sends them; until they're read, the level's own
    const levelSaveIds = saveIds ?? level.saves.map((save) => save.saveId);
    const keys: TrackKey[] = ["bab", "skills", ...levelSaveIds.map((id): TrackKey => `save:${id}`)];
    const tracksChanged = keys.some((key) => valueOf(level, key) !== readTrack(level, key));
    const granted = rows.filter((row) => levelsOf(row).includes(level.id));
    const featsChanged = !sameLevels(
      granted.map((row) => row.key),
      features.filter((row) => row.levelIds.includes(level.id)).map((row) => row.key),
    );
    if (!tracksChanged && !featsChanged) return [];
    return [
      {
        levelId: level.id,
        fields: { bab: valueOf(level, "bab"), skills: valueOf(level, "skills") },
        saves: levelSaveIds.map((saveId) => ({ saveId, base: valueOf(level, `save:${saveId}`) })),
        ...(featsChanged && {
          feats: granted.map((row) => ({ featId: row.featId, aptitudeId: row.aptitudeId, free: freeOf(row, level) })),
        }),
      },
    ];
  });
  const poolEdits = [...pools, ...edits.addedPools].flatMap((pool) => {
    // A level gone since its pick was made takes none
    const picks = Object.entries(edits.pools[pool.aptitudeId] ?? {})
      .filter(([levelId, count]) => classLevelIds.has(levelId) && count !== (pool.picks[levelId] ?? 0))
      .map(([levelId, count]) => ({ levelId, count }));
    return picks.length > 0 ? [{ aptitudeId: pool.aptitudeId, picks }] : [];
  });
  return {
    ...(levelEdits.length > 0 && { levels: levelEdits }),
    ...(poolEdits.length > 0 && { pools: poolEdits }),
  };
}

/** A feature's key: its feat, and the pool it's granted in (a feat can be granted in several). */
export function describeFeatureKey({ aptitudeId, featId }: { aptitudeId: string; featId: string }) {
  return `${featId}-${aptitudeId}`;
}

/**
 * The features the class's levels grant, each with the levels it's granted at: by the first of them, then by name,
 * one a feat and the pool it's granted in.
 */
export function describeFeatureRows(levels: readonly ClassLevelRow[]): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const level of levels.toSorted((a, b) => a.level - b.level)) {
    for (const feat of level.feats) {
      const key = describeFeatureKey({ featId: feat.id, aptitudeId: feat.aptitudeId });
      const row = rows.get(key) ?? {
        aptitudeId: feat.aptitudeId,
        aptitudeName: feat.aptitudeName,
        featId: feat.id,
        key,
        levelIds: [],
        name: feat.name,
      };
      row.levelIds.push(level.id);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** The pools the class's levels give picks in, as its progression reads them. */
export function describePoolRows(progression: ClassProgression | undefined): PoolRow[] {
  return progression?.pools.map(({ aptitudeId, name, picks }) => ({ aptitudeId, name, picks })) ?? [];
}

/** A track's value at a level, as the tab shows it: its edit's, or the saved one. */
export function readEditedTrack(level: ClassLevelRow, key: TrackKey, edits: ProgressionEdits) {
  return edits.tracks[key]?.[level.id] ?? readTrack(level, key);
}

/** A track's value at a level, as saved: 0 for a save the level has no base for. */
export function readTrack(level: ClassLevelRow, key: TrackKey) {
  if (key === "bab") return level.bab;
  if (key === "skills") return level.skills;
  return level.saves.find((save) => `save:${save.saveId}` === key)?.base ?? 0;
}
