/**
 * What an owner's Progression tab changes before its save: its tracks' values (an owned entity's fields its rules set,
 * its amounts: 3.5's saves), the owned entities its features are granted at and its pools' picks, by owned entity id,
 * over the owner as saved; and the save they make, each owned entity's fields by stored field and its amounts and
 * grants among its links, at its lists' roles.
 */

import type { OwnedLists, OwnedRead } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { OwnerProgressionBody } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** A pool, by its id and its name. */
interface PoolRef {
  id: string;
  name: string;
}

/**
 * What an owner's Progression tab offers, as its progression's answer gives it: the pools its features are granted
 * through (`featurePools`), those it may give picks in (`offeredPools`), and its own feature pool (`ownFeaturePool`: its
 * id, none while the ruleset has none, its name, and what a feature made in it is named, its typed name at `{name}`).
 */
export interface FeatureOffers {
  featurePools: PoolRef[];
  offeredPools: PoolRef[];
  ownFeaturePool: { featureName: string; id: string | null; name: string };
}

/**
 * A feature the owner grants (3.5's feat, `toId`, through a feat pool, `viaId`), the owned entities it grants it at, by
 * their ids, and whether a character takes it more than once (`stacks`): one that doesn't is granted at one.
 */
export interface FeatureRow {
  grantedAt: string[];
  key: string;
  name: string;
  stacks: boolean;
  toId: string;
  viaId: string;
  viaName: string | null;
}

/** A pool the owner's owned entities give picks in, and how many each gives, by its id. */
export interface PoolRow {
  id: string;
  name: string;
  picks: Record<string, number>;
}

/** What the tab changed and hasn't saved: each track's, feature's and pool's new values, and the rows it added. */
export interface ProgressionEdits {
  addedFeatures: FeatureRow[];
  addedPools: PoolRow[];
  /** The owned entities a feature is granted at, by the feature's key */
  features: Record<string, string[]>;
  /** A pool's picks, by its id, then by owned entity id */
  pools: Record<string, Record<string, number>>;
  /** A track's values, by its key, then by owned entity id */
  tracks: Partial<Record<TrackKey, Record<string, number>>>;
}

/**
 * A track the Progression tab edits: an owned entity's field, by its key (3.5's `bab`), or an amount (`amount:<id>`).
 */
export type TrackKey = string;

/** An amount's track's key's prefix. */
const AMOUNT_TRACK = "amount:";

/** A tab that changed nothing yet. */
export const NO_EDITS: ProgressionEdits = { addedFeatures: [], addedPools: [], features: {}, pools: {}, tracks: {} };

/** Whether two lists of features' keys hold the same features. */
function sameKeys(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((key) => b.includes(key));
}

/** An amount's track's key, by the entity it's of. */
export function amountTrackKey(entityId: string): TrackKey {
  return `${AMOUNT_TRACK}${entityId}`;
}

/**
 * The save a tab's edits make (`edits`, over the owner's `ownedEntities`, `features` and `pools` as saved): each owned
 * entity's fields its tracks set (`fieldTracks`: each its stored field, by its track's key), and its amounts and grants
 * among its links, at its lists' roles (`lists`), of the ruleset's entities its amounts are of (`amountIds`: 3.5's
 * saves; none while they load, the owned entity's own then, never an empty list); each pool's picks by the pool's `id`.
 */
export function buildProgressionBody(
  ownedEntities: readonly OwnedRead[],
  lists: OwnedLists,
  fieldTracks: readonly { field: string; key: string }[],
  amountIds: readonly string[] | undefined,
  features: readonly FeatureRow[],
  pools: readonly PoolRow[],
  edits: ProgressionEdits,
): Omit<OwnerProgressionBody, "ownedTokens"> {
  const rows = withAddedFeatures(features, edits);
  const savedOwnedIds = new Set(ownedEntities.map((ownedEntity) => ownedEntity.id));
  const grantedAtOf = (row: FeatureRow) => edits.features[row.key] ?? row.grantedAt;
  const valueOf = (ownedEntity: OwnedRead, key: TrackKey) => readEditedTrack(ownedEntity, key, edits);
  const grantOf = (row: FeatureRow, ownedEntity: OwnedRead) =>
    ownedEntity.grants.find((grant) => describeFeatureKey(grant) === row.key);
  // A grant keeps whether it's free; a new one is as its feature's first grant, or free for a new feature
  const freeOf = (row: FeatureRow, ownedEntity: OwnedRead) =>
    (grantOf(row, ownedEntity) ?? ownedEntities.map((other) => grantOf(row, other)).find(Boolean))?.free ?? true;
  const ownedEdits = ownedEntities.flatMap((ownedEntity) => {
    // The ruleset's entities, as an owned entity's form sends their amounts; until they're read, the owned entity's own
    const amountToIds = amountIds ?? ownedEntity.amounts.map((amount) => amount.toId);
    const trackKeys: TrackKey[] = [
      ...fieldTracks.map(({ key }) => key),
      ...amountToIds.map((id) => amountTrackKey(id)),
    ];
    const tracksChanged = trackKeys.some((key) => valueOf(ownedEntity, key) !== readTrack(ownedEntity, key));
    const granted = rows.filter((row) => grantedAtOf(row).includes(ownedEntity.id));
    const grantsChanged = !sameKeys(
      granted.map((row) => row.key),
      features.filter((row) => row.grantedAt.includes(ownedEntity.id)).map((row) => row.key),
    );
    if (!tracksChanged && !grantsChanged) return [];
    const { amounts, grants } = lists;
    return [
      {
        ownedId: ownedEntity.id,
        fields: Object.fromEntries(fieldTracks.map(({ field, key }) => [field, valueOf(ownedEntity, key)])),
        links: {
          ...(amounts && {
            [amounts.role]: amountToIds.map((toId) => ({
              toId,
              amount: valueOf(ownedEntity, amountTrackKey(toId)),
            })),
          }),
          ...(grants &&
            grantsChanged && {
              [grants.role]: granted.map((row) => ({
                toId: row.toId,
                viaId: row.viaId,
                free: freeOf(row, ownedEntity),
              })),
            }),
        },
      },
    ];
  });
  const poolEdits = withAddedPools(pools, edits).flatMap((pool) => {
    // An owned entity gone since its pick was made takes none
    const picks = Object.entries(edits.pools[pool.id] ?? {})
      .filter(([ownedId, count]) => savedOwnedIds.has(ownedId) && count !== (pool.picks[ownedId] ?? 0))
      .map(([ownedId, count]) => ({ ownedId, count }));
    return picks.length > 0 && lists.grants ? [{ id: pool.id, picks }] : [];
  });
  return {
    ...(ownedEdits.length > 0 && { owned: ownedEdits }),
    ...(poolEdits.length > 0 && { pools: poolEdits }),
  };
}

/** A feature's key: its entity (`toId`), and the one it's granted through (a feat can be granted in several pools). */
export function describeFeatureKey({ toId, viaId }: { toId: string; viaId: string }) {
  return `${toId}-${viaId}`;
}

/**
 * A feature's note at an owned entity (`ownedId`), as its toggle's tooltip says it, in its rules' words (`words`): none
 * for a feature that stacks, is granted at none, or at its first owned entity, whichever of its rows grants it (a
 * feature granted through two pools is two rows, `features`); one past its first, saved before the rule, gives nothing
 * (`idle`: `words.repeat`); another is where a click moves it (`move`: `words.single`, none for a viewer, `readOnly`).
 * Each names the feature at `{name}` and its first owned entity at `{position}`, in its rules' word for one
 * (`positionWord`: "level 1").
 */
export function describeFeatureNote(
  row: FeatureRow,
  ownedId: string,
  context: {
    features: readonly FeatureRow[];
    ownedEntities: readonly { id: string; position: number }[];
    positionWord: { one: string };
    readOnly: boolean;
    words: { repeat: string; single: string };
  },
): { kind: "idle" | "move"; text: string } | undefined {
  const { features, ownedEntities, positionWord, readOnly, words } = context;
  const positionOf = (id: string) => ownedEntities.find((entity) => entity.id === id)?.position ?? 0;
  const grantedAt = [
    ...new Set(features.filter((other) => other.toId === row.toId).flatMap((other) => other.grantedAt)),
  ];
  if (row.stacks || grantedAt.length === 0) return undefined;
  const [firstId] = grantedAt.toSorted((a, b) => positionOf(a) - positionOf(b));
  if (ownedId === firstId) return undefined;
  const idle = row.grantedAt.includes(ownedId);
  if (!idle && readOnly) return undefined;
  const position = `${positionWord.one.toLowerCase()} ${positionOf(firstId)}`;
  const text = (idle ? words.repeat : words.single).replace("{name}", row.name).replace("{position}", position);
  return { kind: idle ? "idle" : "move", text };
}

/**
 * The features the owner's owned entities grant, each with the owned entities it's granted at: by the first of them,
 * then by name, one an entity and the one it's granted through (3.5's feat and its pool).
 */
export function describeFeatureRows(ownedEntities: readonly OwnedRead[]): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const ownedEntity of ownedEntities.toSorted((a, b) => a.position - b.position)) {
    for (const grant of ownedEntity.grants) {
      const key = describeFeatureKey(grant);
      const row = rows.get(key) ?? {
        key,
        grantedAt: [],
        name: grant.toName,
        stacks: grant.stacks,
        toId: grant.toId,
        viaId: grant.viaId,
        viaName: grant.viaName,
      };
      row.grantedAt.push(ownedEntity.id);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** A track's value at an owned entity, as the tab shows it: its edit's, or the saved one. */
export function readEditedTrack(ownedEntity: OwnedRead, key: TrackKey, edits: ProgressionEdits) {
  return edits.tracks[key]?.[ownedEntity.id] ?? readTrack(ownedEntity, key);
}

/**
 * What an owner is offered, read off its progression's answer (`answer`) at the keys its rules say (`keys`); none while
 * either is missing, or the answer holds none.
 */
export function readFeatureOffers(
  answer: Record<string, unknown> | undefined,
  keys: { featurePools: string; offeredPools: string; ownFeatures: string } | undefined,
): FeatureOffers | undefined {
  if (!answer || !keys) return undefined;
  const pools = (value: unknown): PoolRef[] =>
    Array.isArray(value)
      ? value.flatMap((pool) =>
          isRecord(pool) && typeof pool.id === "string" && typeof pool.name === "string"
            ? [{ id: pool.id, name: pool.name }]
            : [],
        )
      : [];
  const own = answer[keys.ownFeatures];
  if (!isRecord(own) || typeof own.name !== "string" || typeof own.featureName !== "string") return undefined;
  return {
    featurePools: pools(answer[keys.featurePools]),
    offeredPools: pools(answer[keys.offeredPools]),
    ownFeaturePool: {
      featureName: own.featureName,
      id: typeof own.id === "string" ? own.id : null,
      name: own.name,
    },
  };
}

/**
 * A track's value at an owned entity, as saved: 0 for an entity the owned entity has no amount of, or a field with no
 * number.
 */
export function readTrack(ownedEntity: OwnedRead, key: TrackKey) {
  if (key.startsWith(AMOUNT_TRACK))
    return ownedEntity.amounts.find((amount) => amountTrackKey(amount.toId) === key)?.amount ?? 0;
  const value = ownedEntity.values[key];
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

/**
 * The edits once a feature is taken off the owner (`row`): granted at none of its owned entities, which a save takes
 * its grants off, and gone from the rows they add.
 */
export function withoutFeature(edits: ProgressionEdits, row: FeatureRow): ProgressionEdits {
  return {
    ...edits,
    addedFeatures: edits.addedFeatures.filter((added) => added.key !== row.key),
    features: { ...edits.features, [row.key]: [] },
  };
}

/**
 * The edits once a pool is taken off the owner (`pool`, with its picks as the tab shows them): no picks in it at any
 * owned entity, and gone from the rows they add.
 */
export function withoutPool(edits: ProgressionEdits, pool: PoolRow): ProgressionEdits {
  return {
    ...edits,
    addedPools: edits.addedPools.filter((added) => added.id !== pool.id),
    pools: { ...edits.pools, [pool.id]: Object.fromEntries(Object.keys(pool.picks).map((id) => [id, 0])) },
  };
}
