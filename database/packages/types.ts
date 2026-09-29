import type { Db } from "@/server/database/index.ts";

/** A step that seeds or changes a package's content. */
type Seed = (db: Db) => Promise<void>;

/**
 * Seed data (a base ruleset or an extension) with a version, which the runner installs on a new database
 * and brings up to date on an existing one. `rules.content_packages` records the version each database has.
 *
 * `seeds` install the package at `seedsVersion`. A later change goes in `updates`, keyed by the version it
 * brings the package to (`seedsVersion + 1`, `+ 2`…): a new database runs the seeds then every update, an
 * existing one the updates past its version. Once every database has an update, fold it into the seeds and
 * raise `seedsVersion` to its version, so the seeds alone describe the package.
 *
 * - Never delete a seeded row (a feat, an aptitude, a power…): characters reference them by id.
 * - Keep an update safe to run twice (guard clauses, upserts): a retry after a failure runs it again.
 */
export interface ContentPackage {
  name: string;
  type: "base_ruleset" | "extension";
  seedsVersion: number;
  seeds: Seed[];
  updates?: Record<number, Seed>;
}
