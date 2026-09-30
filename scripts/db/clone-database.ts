/**
 * Copies a database into others, replacing them: a template database (the seeded test database) into the databases
 * test runs use, which takes a fraction of a second where seeding takes several.
 *
 * Usage: bun scripts/db/clone-database.ts
 *   Copies $TEMPLATE_DATABASE_URL's database into $DATABASE_URL's (the e2e run's own database).
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
 * it's copied: it takes none meanwhile, and the ones it has are closed.
 */
export async function cloneDatabase(templateUrl: string, targets: string[]) {
  const { server, name: template } = databaseOf(templateUrl);
  const client = new pg.Client({ connectionString: `${server}/postgres` });
  await client.connect();
  const disconnect = (name: string) =>
    client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [name]);

  try {
    for (const target of targets) {
      await disconnect(target);
      await client.query(`DROP DATABASE IF EXISTS "${target}"`);
    }

    await client.query(`ALTER DATABASE "${template}" WITH allow_connections = false`);
    for (let attempt = 0; attempt < 10; attempt++) {
      const active = await client.query<{ count: string }>(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [template],
      );
      if (Number(active.rows[0].count) === 0) break;
      if (attempt === 9) await disconnect(template);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    for (const target of targets) await client.query(`CREATE DATABASE "${target}" TEMPLATE "${template}"`);
  } finally {
    await client.query(`ALTER DATABASE "${template}" WITH allow_connections = true`);
    await client.end();
  }
}

if (import.meta.main) {
  const template = process.env.TEMPLATE_DATABASE_URL;
  const target = process.env.DATABASE_URL;
  if (!template || !target) throw new Error("Set TEMPLATE_DATABASE_URL (the database to copy) and DATABASE_URL (the copy)");
  await cloneDatabase(template, [databaseOf(target).name]);
  console.log(`Copied ${databaseOf(template).name} into ${databaseOf(target).name}`);
}
