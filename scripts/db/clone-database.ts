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
  return { server: `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}`, name: parsed.pathname.slice(1) };
}

/** The URL of the database named `name` on `url`'s server. */
export const withDatabase = (url: string, name: string) => `${databaseOf(url).server}/${name}${new URL(url).search}`;

/**
 * Replaces the databases `targets` with copies of `templateUrl`'s database. A template can't have connections while
 * it's copied: it takes none meanwhile, and the ones it has are closed. Only a test database is copied, and only into
 * databases named after it, so no other database is ever dropped.
 */
export async function cloneDatabase(templateUrl: string, targets: string[]) {
  const { server, name: template } = databaseOf(templateUrl);
  if (!template.includes("test")) throw new Error(`${template} isn't a test database: only a test database is copied`);
  const unrelated = targets.filter((target) => !target.startsWith(`${template}_`));
  if (unrelated.length) throw new Error(`The copies of ${template} are named ${template}_…, not ${unrelated.join(", ")}`);

  const client = new pg.Client({ connectionString: `${server}/postgres` });
  await client.connect();
  try {
    const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [template]);
    if (!found.rowCount) throw new Error(`${template} doesn't exist: run \`bun run test:db:reset\``);
    for (const target of targets) await client.query(`DROP DATABASE IF EXISTS "${target}" WITH (FORCE)`);

    await client.query(`ALTER DATABASE "${template}" WITH allow_connections = false`);
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const active = await client.query<{ count: string }>(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [template],
        );
        if (Number(active.rows[0].count) === 0) break;
        if (attempt === 9) {
          await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [template]);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      for (const target of targets) await client.query(`CREATE DATABASE "${target}" TEMPLATE "${template}"`);
    } finally {
      await client.query(`ALTER DATABASE "${template}" WITH allow_connections = true`);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const template = process.env.TEMPLATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const suffix = process.argv[2];
  if (!template || !suffix) throw new Error("Usage: bun scripts/db/clone-database.ts <suffix>, with DATABASE_URL (or TEMPLATE_DATABASE_URL) the database to copy");
  const target = `${databaseOf(template).name}_${suffix}`;
  await cloneDatabase(template, [target]);
  console.log(`Copied ${databaseOf(template).name} into ${target}`);
}
