import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import { Pool } from "pg";

import { db } from "@/server/database/index.ts";

import { assertLocalDatabase, databaseOf } from "./clone-database.ts";
import seedDatabase, { includeTestSeedsOption } from "./seed.ts";

/**
 * Empties the local database DATABASE_URL names (every schema the app or its tools made, and public's tables and
 * enums), migrates it as production does, then seeds it.
 */
export default async function resetDatabase(includeTestSeeds: boolean) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  assertLocalDatabase(connectionString, "reset");
  console.log(`Resetting database: ${databaseOf(connectionString).name} on ${new URL(connectionString).host}`);

  await db.execute(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
  `);
  await db.execute(`
    DO $$ DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT nspname FROM pg_namespace
            WHERE nspname NOT IN ('public', 'information_schema') AND nspname !~ '^pg_'
        ) LOOP
            EXECUTE 'DROP SCHEMA ' || quote_ident(r.nspname) || ' CASCADE';
        END LOOP;

        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;

        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
            EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
    END $$;
  `);

  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await runMigrations({ pgPool: pool });
  } finally {
    await pool.end();
  }
  console.log("✓ Migrations applied");

  await seedDatabase(db, includeTestSeeds);
}

if (import.meta.main) {
  await resetDatabase(includeTestSeedsOption("reset"));
  console.log("Database reset completed!");
  process.exit(0);
}
