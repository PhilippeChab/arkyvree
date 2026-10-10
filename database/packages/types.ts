import type { CharacterSeed } from "@/content/core/builders/characters/types.ts";
import type {
  CorePackageDefinition,
  ExtensionPackageDefinition,
  PackageDefinition,
} from "@/content/core/builders/packages/types.ts";
import type { ContentSeeder, SeedContext } from "@/database/seeders/core/ContentSeeder.ts";
import type { Db } from "@/server/database/index.ts";

/** A step that seeds or changes a package's content. */
type Seed = (db: Db) => Promise<void>;

/**
 * A content package as the runner applies it: its definition's name, type and version (`content/<ruleset>/packages/`),
 * with the seeds that write its content, and its updates. The runner installs it on a new database and brings it up
 * to date on an existing one. `rules.content_packages` records the version each database has.
 *
 * `seeds` install the package at `seedsVersion`. A later change goes in `updates`, keyed by the version it
 * brings the package to (`seedsVersion + 1`, `+ 2`…): a new database runs the seeds then every update, an
 * existing one the updates past its version. Once every database has an update, fold it into the seeds and
 * raise `seedsVersion` to its version, so the seeds alone describe the package.
 *
 * - Never delete a seeded row (a feat, an aptitude, a power…): characters reference them by id.
 * - Keep an update safe to run twice (guard clauses, upserts): a retry after a failure runs it again.
 */
export interface ContentPackage extends Pick<PackageDefinition, "name" | "seedsVersion" | "type"> {
  seeds: Seed[];
  updates?: Record<number, Seed>;
}

/**
 * A base rules' content, as its row of the registry gives it (`database/packages/registry.ts`): its core rules'
 * package, which creates its core ruleset, its extensions' (`Core` and `Book`, what they seed), the seeder that writes
 * them, and the characters the dev and test databases are seeded with on its core rules.
 */
export interface RulesetContent<Core = unknown, Book = unknown> {
  core: CorePackageDefinition<Core>;
  /** In the order the runner applies them, after the core rules. */
  extensions: ExtensionPackageDefinition<Book>[];
  seeder: SeederClass<Core, Book>;
  testCharacters: CharacterSeed[];
  /** Its packages' updates, by package name (see `ContentPackage`): an update writes, so it's the database's. */
  updates?: Record<string, Record<number, Seed>>;
}

/**
 * A base rules' seeder, as its row of the registry names it: its class, a concrete `ContentSeeder` of its content, with
 * `ContentSeeder`'s statics, which create the rulesets its packages seed (`createCore`, `createExtension`).
 */
export type SeederClass<Core = unknown, Book = unknown> = Omit<typeof ContentSeeder, "prototype"> &
  (new (db: Db, ctx: SeedContext) => ContentSeeder<Core, Book>);
