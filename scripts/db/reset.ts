import { db } from "@/server/database/index.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import { Pool } from "pg";
import seedDatabase from "./seed.ts";

export default async function resetDatabase(includeSeeds: boolean = true) {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log(`Resetting database: ${connectionString}`);

  try {
    // Ensure extensions exist
    await db.execute(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
    `);

    // Drop all tables, schemas, and enums
    await db.execute(`
      DO $$ DECLARE
          r RECORD;
      BEGIN
          FOR r IN (
              SELECT schemaname, tablename
              FROM pg_tables
              WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          ) LOOP
              EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;

          FOR r IN (
              SELECT nspname
              FROM pg_namespace
              WHERE nspname IN ('account', 'customization', 'campaign', 'character', 'rules', 'storage', 'graphile_worker')
          ) LOOP
              EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.nspname) || ' CASCADE';
          END LOOP;

          FOR r IN (
              SELECT typname
              FROM pg_type
              WHERE typnamespace = 'public'::regnamespace
                AND typtype = 'e'
          ) LOOP
              EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
          END LOOP;
      END $$;
    `);

    // Apply migrations (same path as production)
    const pool = new Pool({ connectionString });
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./drizzle" });

    // Set up graphile-worker schema
    await runMigrations({ pgPool: pool });

    await pool.end();
    console.log("✓ Migrations applied");

    // Seed
    await seedDatabase(db, includeSeeds);
  } catch (err) {
    const e = err as Error;
    console.error("Error resetting database:");
    console.error(e.message);
    console.error(e.cause);
    console.error(e.stack);
    throw err;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/db/reset.ts [options]

Options:
  --with-test-data    Include test data seeds
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  const includeTestSeeds = args.includes("--with-test-data");
  await resetDatabase(includeTestSeeds);
  console.log("Database reset completed!");
  process.exit(0);
}
