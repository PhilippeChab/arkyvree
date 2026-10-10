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
