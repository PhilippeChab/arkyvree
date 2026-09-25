import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { EntitySnapshots } from "@/server/repositories/index.ts";
import { NAME_FALLBACK_TABLES } from "./constants.ts";

/**
 * Branded `Map<string, string>` carrying compose-skip semantic. Keys are
 * source-entity IDs of true COW overrides — read by `compose()` to drop
 * the source row when a child has overridden it. The brand stops it being
 * passed where an `IdResolveMap` is expected (or vice versa). Construct via
 * `newOverrideMap()` only.
 */
export type OverrideMap = Map<string, string> & { readonly __brand: "OverrideMap" };

/**
 * Branded `Map<string, string>` carrying id-canonicalize semantic. Maps any
 * "stale" id (true override source, aptitude name-grouping loser, snapshot
 * sibling loser) to its canonical winner. Read by the repo Proxy
 * (`canonicalizeArgs`, `resolveRowOverrides`), `BaseRepository.idMatches`,
 * `cowResolvingMap`, and `resolveOverrides`. Construct via
 * `newIdResolveMap(seed?)` only.
 */
export type IdResolveMap = Map<string, string> & { readonly __brand: "IdResolveMap" };

export function newOverrideMap(entries?: Iterable<readonly [string, string]>): OverrideMap {
  return new Map<string, string>(entries) as OverrideMap;
}

export function newIdResolveMap(seed?: OverrideMap | IdResolveMap): IdResolveMap {
  return new Map<string, string>(seed) as IdResolveMap;
}

/**
 * Construction-time invariant: `idResolveMap` MUST be a superset of
 * `overrideMap`. The proxy / cowResolvingMap layer needs every stale id
 * compose can skip to also resolve to a winner. Throws if not — bugs in
 * `buildOverrideMap` / `getOrBuildCowData` should fail fast, not silently
 * corrupt downstream.
 */
export function assertCowMapsConsistent(overrideMap: OverrideMap, idResolveMap: IdResolveMap): void {
  if (idResolveMap.size < overrideMap.size) {
    throw new Error(
      `CowData invariant violated: idResolveMap.size (${idResolveMap.size}) < overrideMap.size (${overrideMap.size})`,
    );
  }
  for (const key of overrideMap.keys()) {
    if (!idResolveMap.has(key)) {
      throw new Error(`CowData invariant violated: overrideMap key ${key} missing from idResolveMap`);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Source chain
// ──────────────────────────────────────────────────────────────

/**
 * Build the combined source chain for COW lookups:
 * extensions first (their new entities are visible), then ancestors.
 */
export function buildSourceChain(ruleset: { extensionRulesetIds: string[]; ancestorRulesetIds: string[] }): string[] {
  return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
}

// ──────────────────────────────────────────────────────────────
// COW-specific functions
// ──────────────────────────────────────────────────────────────

/**
 * Build override + sibling pairing data for a fork. Returns three maps:
 *
 *   - `map`           — true overrides (sourceEntityId → forkedEntityId)
 *                       from `entitySnapshotsInRules`. Used by compose's
 *                       skip-overridden filter.
 *   - `siblingMap`    — winner-id → loser-id[] for siblings that should be
 *                       merged at compose / cowEntity time.
 *   - `idResolveMap`  — superset of `map` plus sibling-loser aliases.
 *                       Read by every id-canonicalization layer (proxy,
 *                       resolveOverrides, cowResolvingMap).
 *
 * Three pairing passes run in order, each strictly weaker than the last so
 * earlier wins are preserved:
 *
 *   1. Snapshot-based pass — pairs entities with shared `sourceEntityId`
 *      across the ruleset chain (the ordinary COW model: extension wins,
 *      base aliases to extension's COW).
 *   2. Snapshot-extension siblings — when multiple extensions COW the
 *      same base entity, the non-winners become siblings of the winner.
 *   3. Name-based fallback for `NAME_FALLBACK_ENTITY_TYPES` — pairs same-
 *      name native rows across the chain when the snapshot pass didn't
 *      catch them (e.g. a spell reprinted in two D&D sourcebooks).
 *
 * `ancestorRulesetIds` is a misnomer at the call site: `getOrBuildCowData`
 * passes the full source chain (extensions + ancestors) for snapshot
 * lookup; `cowEntity` passes ancestors-only. Both are valid for the
 * snapshot pass; the name-fallback pass dedupes them with
 * `extensionRulesetIds` to recover a stable ordering.
 *
 * `extensionRulesetIds` flags which rulesets in the chain are subscribed
 * extensions vs. ancestors of the fork. Required for sibling detection;
 * if omitted, only true overrides are returned.
 */
export async function buildOverrideMap(
  db: Db,
  rulesetId: string,
  ancestorRulesetIds: string[],
  extensionRulesetIds?: string[],
): Promise<{ map: OverrideMap; siblingMap: Map<string, string[]>; idResolveMap: IdResolveMap }> {
  const allRulesetIds = [rulesetId, ...ancestorRulesetIds];
  const allSnapshots = await EntitySnapshots.findByRulesetIds(db, { rulesetIds: allRulesetIds });

  // Group by rulesetId, process closest-first (allRulesetIds is already ordered closest-first)
  const byRuleset = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots) {
    if (!byRuleset.has(snap.rulesetId)) {
      byRuleset.set(snap.rulesetId, []);
    }
    byRuleset.get(snap.rulesetId)!.push(snap);
  }

  const map = newOverrideMap();
  for (const rid of allRulesetIds) {
    const snaps = byRuleset.get(rid) ?? [];
    for (const snap of snaps) {
      if (!map.has(snap.sourceEntityId)) {
        map.set(snap.sourceEntityId, map.get(snap.forkedEntityId) ?? snap.forkedEntityId);
      }
    }
  }

  // idResolveMap starts as a copy of map (true overrides) and gets sibling-loser
  // entries appended below. Kept separate so compose's "skip overridden" check
  // (which reads `map`) doesn't sweep up sibling losers (whose customizations
  // need to merge into the winner, not be skipped).
  const idResolveMap = newIdResolveMap(map);

  // Build siblingMap: when multiple snapshots share a sourceEntityId, the
  // winner's forkedEntityId maps to the sibling-loser forkedEntityIds. The
  // winner can be either an extension's COW or the child fork's own COW.
  // Local winners are converted to true overrides after both pairing passes,
  // so their customizations are not merged again on reads.
  const extensionSet = new Set(extensionRulesetIds ?? []);
  const siblingMap = new Map<string, string[]>();

  if (extensionSet.size > 0) {
    const bySource = new Map<string, typeof allSnapshots>();
    // Match compose's source-chain order when choosing duplicate sibling
    // contributions. The snapshot query has no ordering guarantee.
    for (const rid of allRulesetIds) {
      for (const snap of byRuleset.get(rid) ?? []) {
        const group = bySource.get(snap.sourceEntityId) ?? [];
        group.push(snap);
        bySource.set(snap.sourceEntityId, group);
      }
    }

    for (const [sourceId, snaps] of bySource) {
      if (snaps.length <= 1) continue;
      const winnerId = map.get(sourceId);
      if (!winnerId) continue;
      // Sibling losers are extension shadows that aren't the winner. Works in
      // both the direct case (winner is one of these snaps) and the chained
      // case (winner reached via a closer snapshot whose source links into
      // this group). Append so we don't clobber prior entries for the same
      // winner (aptitude name-grouping below also writes here).
      const siblingIds = snaps
        .filter((s) => s.forkedEntityId !== winnerId && extensionSet.has(s.rulesetId))
        .map((s) => s.forkedEntityId);
      if (siblingIds.length === 0) continue;
      const existing = siblingMap.get(winnerId) ?? [];
      siblingMap.set(winnerId, [...existing, ...siblingIds]);
      // Sibling losers are aliased to the winner in idResolveMap so stale
      // references (a stored pick whose feat id is now a sibling loser)
      // resolve at the proxy / cowResolvingMap layer. They are intentionally
      // NOT added to `map` — compose iterates their customizations through
      // the sibling-merge path.
      for (const siblingId of siblingIds) {
        if (!idResolveMap.has(siblingId)) idResolveMap.set(siblingId, winnerId);
      }
    }
  }

  // Name-based sibling fallback for same-name reprints. When two rulesets in
  // the source chain natively define entities with the same name without
  // sharing a sourceEntityId (e.g. a spell reprinted in two D&D sourcebooks,
  // or a user extension that re-introduces a spell from another extension to
  // attach it to a custom class list), pair them as siblings so compose merges
  // them and `cowEntity` bakes their data into a child fork's COW. Last-resort
  // only — rows already paired via entitySnapshotsInRules are excluded so the
  // snapshot-based pass always wins. Worst-case for an unwanted merge between
  // unrelated user extensions: the merged entity looks weird; the user can COW
  // it and edit. Recoverable, not data loss.
  //
  // The `ancestorRulesetIds` parameter is a misnomer — getOrBuildCowData passes
  // the full source chain (extensions + ancestors), while cowEntity passes
  // ancestors-only. Dedupe so this pass behaves the same from either call site.
  const dedupedChain = [...new Set([...(extensionRulesetIds ?? []), ...ancestorRulesetIds])];
  if (extensionSet.size > 0 && dedupedChain.length > 1) {
    const subqueries = NAME_FALLBACK_TABLES.map(({ entityType, table }) =>
      db
        .select({
          entityType: sql<string>`${entityType}::text`.as("entity_type"),
          id: table.id,
          name: table.name,
          rulesetId: table.rulesetId,
        })
        .from(table)
        .leftJoin(entitySnapshotsInRules, and(
          eq(entitySnapshotsInRules.forkedEntityId, table.id),
          eq(entitySnapshotsInRules.rulesetId, table.rulesetId),
          eq(entitySnapshotsInRules.entityType, entityType),
        ))
        .where(and(
          inArray(table.rulesetId, dedupedChain),
          isNull(entitySnapshotsInRules.id),
          isNull(table.deletedAt),
          isNull(table.campaignId),
        )),
    );

    const [first, second, ...rest] = subqueries;
    const rows = await unionAll(first, second, ...rest);

    const chainIndex = new Map(dedupedChain.map((id, i) => [id, i]));

    const byTypeName = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.entityType}|${row.name}`;
      const group = byTypeName.get(key);
      if (group) group.push(row);
      else byTypeName.set(key, [row]);
    }

    // Closest-first: extensions come before ancestors in dedupedChain, so an
    // extension that natively reprints a base entity wins and base aliases to
    // it. Mirrors the snapshot pass's `map.set(sourceEntityId, forkedEntityId)`
    // direction — extension overrides base, full stop.
    for (const [, group] of byTypeName) {
      if (group.length <= 1) continue;
      const sorted = group.sort((a, b) =>
        (chainIndex.get(a.rulesetId) ?? 999) - (chainIndex.get(b.rulesetId) ?? 999),
      );
      const [winner, ...losers] = sorted;
      for (const loser of losers) {
        if (!idResolveMap.has(loser.id)) idResolveMap.set(loser.id, winner.id);
      }
      const existingSiblings = siblingMap.get(winner.id) ?? [];
      siblingMap.set(winner.id, [...existingSiblings, ...losers.map((l) => l.id)]);
    }
  }

  // A local COW already owns its customizations. Keep sibling IDs resolvable,
  // but suppress their source rows instead of merging them back into the copy.
  // Include tombstones so deleting the local entity cannot revive a sibling.
  const localIds = new Set((byRuleset.get(rulesetId) ?? []).map(s => s.forkedEntityId));
  for (const [winnerId, siblingIds] of siblingMap) {
    const resolvedId = idResolveMap.get(winnerId) ?? winnerId;
    if (!localIds.has(resolvedId)) continue;
    for (const siblingId of siblingIds) {
      map.set(siblingId, resolvedId);
      idResolveMap.set(siblingId, resolvedId);
    }
  }

  return { map, siblingMap, idResolveMap };
}

/**
 * Generic override resolver: scans all string fields in each row and replaces
 * any value that matches a key in the override map with the child's ID.
 * Handles saves.abilityId, skills.primaryAbilityId, powers.saveId, items.sourceItemId,
 * races.parentId, klasses.parentId — all generically without per-entity hardcoding.
 */
export function resolveOverrides<T extends Record<string, unknown>>(
  rows: T[],
  overrideMap: IdResolveMap,
): T[] {
  if (overrideMap.size === 0) return rows;

  return rows.map((row) => {
    const resolved = { ...row };
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string" && overrideMap.has(value)) {
        (resolved as Record<string, unknown>)[key] = overrideMap.get(value);
      }
    }
    return resolved;
  });
}

/**
 * After resolveOverrides swaps FK IDs, data fields (name, description, etc.)
 * still come from the base entity row because the DB join matched the original ID.
 * This function refreshes specified fields from authoritative entity data.
 */
export function refreshEntityData<T extends Record<string, unknown> & { id: string }>(
  rows: T[],
  referenceData: { id: string }[],
  keys: string[],
): T[] {
  if (referenceData.length === 0 || keys.length === 0) return rows;

  const dataMap = new Map<string, Record<string, unknown>>();
  for (const entity of referenceData) {
    dataMap.set(entity.id, entity as Record<string, unknown>);
  }

  return rows.map((row) => {
    const source = dataMap.get(row.id);
    if (!source) return row;
    const result = { ...row };
    for (const key of keys) {
      if (key in source) {
        (result as Record<string, unknown>)[key] = source[key];
      }
    }
    return result;
  });
}
