import DependentCache from "@/server/cache/DependentCache.ts";
import { getOrFetchRulesetData, type CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db, type Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Aptitudes, EntitySnapshots, KlassLevels, Rulesets } from "@/server/repositories/index.ts";
import { withCowContext } from "@/server/services/rulesets/cowContext.ts";
import {
  assertCowMapsConsistent,
  buildOverrideMap,
  buildSourceChain,
  newIdResolveMap,
  newOverrideMap,
  type IdResolveMap,
  type OverrideMap,
} from "./overrideMap.ts";

// ──────────────────────────────────────────────────────────────
// Cached COW data
// ──────────────────────────────────────────────────────────────

export interface CowData {
  sourceChain: string[];
  /** Compose-skip semantic — see {@link OverrideMap}. */
  overrideMap: OverrideMap;
  /** ID-canonicalize semantic — see {@link IdResolveMap}. Superset of `overrideMap`. */
  idResolveMap: IdResolveMap;
  /** Maps a winning COW'd entity ID → sibling-loser COW'd entity IDs */
  siblingMap: Map<string, string[]>;
  /** Flattened set of every sibling ID, precomputed from siblingMap */
  siblingIds: Set<string>;
}

const cowDataCache = new DependentCache<CowData>();

/**
 * Get or build cached COW data for a ruleset: sourceChain + overrideMap + klass level mappings.
 * Cache key includes the ruleset ID and ordered source chain; invalidated on mutations.
 *
 * Always reads via the imported `db` (committed state) — never accepts a tx
 * handle. Letting an in-progress mutation's uncommitted writes populate this
 * shared cache would leak phantom data to every other concurrent reader.
 */
export async function getOrBuildCowData(
  ruleset: { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] },
): Promise<CowData> {
  // COW maps are shared infrastructure; never build them through a caller's
  // active map (notably during nested master/companion character builds).
  const dependencies = [ruleset.id, ...buildSourceChain(ruleset)];
  // A request holding old ruleset metadata must not cache its old subscription
  // chain under the same key used by readers of the newly committed chain.
  return cowDataCache.getOrFetch(JSON.stringify(dependencies), dependencies, async () => ({
    data: await withCowContext(undefined, () => buildCowData(ruleset)),
  }));
}

async function buildCowData(
  ruleset: { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] },
): Promise<CowData> {
  const sourceChain = buildSourceChain(ruleset);

  let overrideMap: OverrideMap;
  let siblingMap: Map<string, string[]>;
  let idResolveMap: IdResolveMap;

  if (sourceChain.length > 0) {
    const result = await buildOverrideMap(db, ruleset.id, sourceChain, ruleset.extensionRulesetIds);
    overrideMap = result.map;
    siblingMap = result.siblingMap;
    idResolveMap = result.idResolveMap;

    // Enrich overrideMap with klass-level id pairs for COW'd klasses — levels
    // aren't individually snapshotted, so we back-fill pairs here by matching
    // on level number. Also mirror into idResolveMap so id-based lookups
    // (e.g. resolving a stored klass-level id) resolve to the post-COW id.
    if (overrideMap.size > 0) {
      const klassSnaps = await EntitySnapshots.findByTypeAndRuleset(db, {
        rulesetId: ruleset.id,
        entityType: "klasses",
      });
      for (const snap of klassSnaps) {
        const [parentLevels, childLevels] = await Promise.all([
          KlassLevels.findManyByKlass(db, { klassId: snap.sourceEntityId }),
          KlassLevels.findManyByKlass(db, { klassId: snap.forkedEntityId }),
        ]);
        for (const parentLevel of parentLevels) {
          const childLevel = childLevels.find((l) => l.level === parentLevel.level);
          if (childLevel) {
            overrideMap.set(parentLevel.id, childLevel.id);
            idResolveMap.set(parentLevel.id, childLevel.id);
          }
        }
      }
    }
  } else {
    overrideMap = newOverrideMap();
    siblingMap = new Map<string, string[]>();
    idResolveMap = newIdResolveMap();
  }

  // Deduplicate aptitudes with the same name across the source chain.
  // Each extension independently creates aptitudes it needs (self-contained),
  // so duplicates arise when multiple extensions reference the same spell list,
  // or when an extension recreates a base aptitude (e.g., "General").
  // Pick one winner per name; losers go into siblingMap (compose filters them
  // via siblingIds) + idResolveMap (so FK refs to a loser remap to the winner).
  // Intentionally NOT in overrideMap — compose-skip is for true overrides only.
  // Closest-first chain order: extensions come before ancestors in sourceChain,
  // so any extension that re-creates a base-named aptitude wins and base
  // aliases to it. Same direction as the snapshot pass — extension overrides
  // base, no exception.
  if (ruleset.extensionRulesetIds.length > 0) {
    const allAptitudes = await Aptitudes.findMany(db, { rulesetIds: sourceChain });
    const chainIndex = new Map(sourceChain.map((id, i) => [id, i]));
    const byName = new Map<string, typeof allAptitudes>();
    for (const apt of allAptitudes) {
      const group = byName.get(apt.name);
      if (group) group.push(apt);
      else byName.set(apt.name, [apt]);
    }
    for (const [, group] of byName) {
      if (group.length <= 1) continue;
      const sorted = group.sort((a, b) =>
        (chainIndex.get(a.rulesetId) ?? 999) - (chainIndex.get(b.rulesetId) ?? 999),
      );
      const [winner, ...losers] = sorted;
      // Aliases must point directly to the visible copy, including a local COW.
      const resolvedWinnerId = idResolveMap.get(winner.id) ?? winner.id;
      for (const loser of losers) {
        if (!idResolveMap.has(loser.id)) idResolveMap.set(loser.id, resolvedWinnerId);
      }
      const existingSiblings = siblingMap.get(winner.id) ?? [];
      siblingMap.set(winner.id, [...existingSiblings, ...losers.map((l) => l.id)]);
    }
  }

  assertCowMapsConsistent(overrideMap, idResolveMap);

  const cowData: CowData = {
    sourceChain,
    overrideMap,
    idResolveMap,
    siblingMap,
    siblingIds: new Set(Array.from(siblingMap.values()).flat()),
  };
  return cowData;
}

export function invalidateCowData(rulesetId: string): void {
  cowDataCache.invalidate(rulesetId);
}

export function invalidateAllCowData(): void {
  cowDataCache.invalidateAll();
}

/**
 * Scope helper: loads the ruleset, builds cowData, and runs `fn` inside a
 * cowContext so every repository read inside auto-resolves pre-COW ids to
 * post-COW (output Proxy) AND every entity-id WHERE-clause input is
 * auto-canonicalized (input Proxy). Services call this once at the top of
 * a character-scoped operation; downstream code stops caring about COW.
 *
 * Throws `NotFoundError("Ruleset not found")` if `rulesetId` doesn't exist,
 * so the callback always receives non-null `{ ruleset, cowData }` and
 * doesn't have to branch or add defensive sourceChain fallbacks.
 */
export async function withRulesetScope<T>(
  tx: Db,
  rulesetId: string,
  fn: (ctx: {
    ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
    rulesetData: CachedRulesetData;
  }) => Promise<T>,
): Promise<T> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  const cowData = await getOrBuildCowData(ruleset);
  const rulesetData = await getOrFetchRulesetData(rulesetId, cowData);
  return await withCowContext(cowData, () => fn({ ruleset, rulesetData }));
}

/**
 * Multi-ruleset variant: preload `rulesetData` for every unique id and hand
 * the map to `fn`. Used for list operations that enrich rows from many
 * rulesets at once (getMyCharacters, getCampaignCharacters) where a single
 * `cowContext` would have to pick one ruleset, excluding the others.
 *
 * No `cowContext` is activated — the composed `rulesetData.*` Maps already
 * wrap stored ids through their own per-ruleset overrideMap, so lookups
 * work without ambient context. Services that need character-scoped repo
 * auto-resolution for a specific character should use `withRulesetScope`
 * inside their per-character enrichment path.
 *
 * Missing rulesets are silently skipped (rare: a character row referencing
 * a deleted ruleset); the map just won't have that key.
 */
export async function withRulesetScopes<T>(
  tx: Db,
  rulesetIds: Iterable<string>,
  fn: (rulesetDataByRulesetId: Map<string, CachedRulesetData>) => Promise<T>,
): Promise<T> {
  const unique = [...new Set(rulesetIds)];
  const map = new Map<string, CachedRulesetData>();
  for (const rulesetId of unique) {
    const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
    if (!ruleset) continue;
    const cowData = await getOrBuildCowData(ruleset);
    const rulesetData = await getOrFetchRulesetData(rulesetId, cowData);
    map.set(rulesetId, rulesetData);
  }
  return fn(map);
}
