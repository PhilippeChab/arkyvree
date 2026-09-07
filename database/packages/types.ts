import type { Db } from "@/server/database/index.ts";

/**
 * A content package wraps seed data (base rulesets, extensions) with version
 * tracking so the runner can install new packages and apply incremental updates
 * to existing ones.
 *
 * ## Versioning
 *
 * - `seeds` establishes v1 data on first install. It is never re-run.
 * - `version` starts at 1. Bump it when the package needs a data change.
 * - `updates` is keyed by target version. On fresh install the runner runs
 *   seeds (v1) then applies updates 2 → version. On existing databases it
 *   runs updates from appliedVersion+1 → version. Both paths run inside a
 *   single transaction.
 *
 * ### Example: adding feats in v2 and fixing a description in v3
 *
 * ```ts
 * const dnd35: ContentPackage = {
 *   name: "dnd35",
 *   version: 3,
 *   seeds: [...],
 *   updates: {
 *     2: async (db) => {
 *       await db.insert(featsInRules).values([...]);
 *     },
 *     3: async (db) => {
 *       await db.update(featsInRules)
 *         .set({ description: "..." })
 *         .where(eq(featsInRules.name, "Power Attack"));
 *     },
 *   },
 * };
 * ```
 *
 * ### Rules
 *
 * - **Never delete seed data** (feats, aptitudes, powers, etc.) — characters
 *   reference these rows by ID. Deleting them will break existing characters.
 *   Always add new entries or update existing ones in place.
 * - Never remove or reorder entries in `updates` — existing databases rely on
 *   the version chain being stable.
 * - Each update function must be idempotent where possible (use upserts, guard
 *   clauses) so a retry after partial failure is safe.
 * - The runner throws if it encounters a version gap with no matching update
 *   function, so every bumped version must have an entry.
 */
export interface ContentPackage {
  name: string;
  type: "base_ruleset" | "extension";
  baseRuleset?: string;
  description: string;
  version: number;
  seeds: ((db: Db) => Promise<void>)[];
  updates?: Record<number, (db: Db) => Promise<void>>;
}
