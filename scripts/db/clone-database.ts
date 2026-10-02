/**
 * Copies a test database into others, replacing them, which takes a fraction of a second where seeding takes several:
 * the seeded test database into the unit tests' worker databases and the e2e template, and the e2e template into an
 * e2e run's own database.
 *
 * Usage: bun --env-file=.env.test scripts/db/clone-database.ts <suffix>
 *   Copies $TEMPLATE_DATABASE_URL's database (by default $DATABASE_URL's) into <its name>_<suffix>.
 */
import pg from "pg";

/** A database URL's server (without a database) and database name. */
export function databaseOf(url: string) {
  const parsed = new URL(url);
  return {
    server: `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}`,
    name: parsed.pathname.slice(1),
  };
}

/** The URL of the database named `name` on `url`'s server. */
export const withDatabase = (url: string, name: string) => `${databaseOf(url).server}/${name}${new URL(url).search}`;

/** The hosts of a local database server: the only one whose databases are replaced or reset. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Refuses `url` unless its database is on a local server: a script that drops databases or tables runs only there. */
export function assertLocalDatabase(url: string, action: string) {
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(`${hostname} isn't a local database server: only a local database is ${action}`);
  }
}

/**
 * Replaces the databases `targets` with copies of `templateUrl`'s database. Only a local test database (`test` a word
 * of its name) is copied, and only into databases named after it, so no other database is ever dropped.
 */
export async function cloneDatabase(templateUrl: string, targets: string[]) {
  const { server, name: template } = databaseOf(templateUrl);
  assertLocalDatabase(templateUrl, "copied");
  if (!/^[a-z0-9_]+$/.test(template) || !/(^|_)test(_|$)/.test(template)) {
    throw new Error(
      `${template} isn't a test database (test a word of a name of letters, digits and _): only a test database is copied`,
    );
  }
  // Postgres cuts a longer name to 63 bytes, which could make a copy's name its template's, or another copy's
  const unrelated = targets.filter(
    (target) =>
      !target.startsWith(`${template}_`) ||
      !/^[a-z0-9_]+$/.test(target.slice(template.length + 1)) ||
      target.length > 63,
  );
  if (unrelated.length)
    throw new Error(
      `The copies of ${template} are named ${template}_ and letters, digits or _, in 63 characters, not ${unrelated.join(", ")}`,
    );

  const client = new pg.Client({ connectionString: `${server}/postgres` });
  await client.connect();
  const name = (database: string) => client.escapeIdentifier(database);
  const connections = async (database: string) =>
    Number(
      (
        await client.query<{ count: string }>(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [database],
        )
      ).rows[0].count,
    );
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [template]);
    if (!found.rowCount) throw new Error(`${template} doesn't exist: run \`bun run test:db:reset\``);
    for (const target of targets) {
      await client.query(`DROP DATABASE IF EXISTS ${name(target)} WITH (FORCE)`);
      // A template can't have connections while it's copied: wait for its own to end, then end them. It keeps taking
      // new ones meanwhile, so an interrupted copy leaves it as it was; one that comes in just before the copy fails it
      // (after five seconds), and it's tried again.
      for (let attempt = 1; ; attempt++) {
        for (let wait = 0; wait < 10 && (await connections(template)) > 0; wait++)
          await new Promise((resolve) => setTimeout(resolve, 500));
        await client.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [template],
        );
        try {
          await client.query(`CREATE DATABASE ${name(target)} TEMPLATE ${name(template)}`);
          break;
        } catch (error) {
          if (!(error instanceof pg.DatabaseError && error.code === "55006") || attempt === 3) throw error;
        }
      }
    }
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const template = process.env.TEMPLATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const suffix = process.argv[2];
  if (!template || !suffix)
    throw new Error(
      "Usage: bun scripts/db/clone-database.ts <suffix>, with DATABASE_URL (or TEMPLATE_DATABASE_URL) the database to copy",
    );
  const target = `${databaseOf(template).name}_${suffix}`;
  await cloneDatabase(template, [target]);
  console.log(`Copied ${databaseOf(template).name} into ${target}`);
}
