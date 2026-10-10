/** A base ruleset's own rules' package: the core ruleset it creates, and the core rules' content (`C`) it seeds. */
export type CorePackageDefinition<C = unknown> = PackageDefinition<C> & { type: "base_ruleset" };

/** An extension's package: the extension of the core rules it creates, and the book (`B`) it seeds. */
export type ExtensionPackageDefinition<B = unknown> = PackageDefinition<B> & { type: "extension" };

/**
 * A content package, as data: its name and the version its seeds install, the system ruleset it creates and the content
 * it seeds there, which its ruleset's seeder writes (`database/seeders/<ruleset>/`) when the runner applies it
 * (`database/packages/`). See docs/packages.md for its versioning.
 */
export interface PackageDefinition<C = unknown> {
  /** What it seeds into its ruleset. */
  content: C;
  /** Its name in `rules.content_packages`, which records each database's version of it. */
  name: string;
  /** The system ruleset it creates: its display name and description. */
  ruleset: { description: string; name: string };
  /** The version its seeds install: a database below it is refused, the updates it lacks being part of the seeds. */
  seedsVersion: number;
  /** A base ruleset's own rules, or an extension of them. */
  type: "base_ruleset" | "extension";
}
