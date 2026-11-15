import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import { Pool } from "pg";

import { applyPackages } from "@/database/packages/runner.ts";
import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import StoredRegistries from "@/server/repositories/stored/StoredRegistries.ts";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  // A migration says what it checked and what it found (its `RAISE NOTICE`s): node-postgres drops a notice nothing
  // listens for
  pool.on("connect", (client) => client.on("notice", (notice) => console.log(`  ${notice.message}`)));
  // An idle connection the database drops ends the run with its error, rather than an unhandled one
  pool.on("error", (error) => {
    console.error("Database connection error:", error);
    process.exit(1);
  });

  try {
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully");

    // The job queue's own tables: the web queues jobs before a worker has ever started on a new database
    await runMigrations({ pgPool: pool });
    console.log("Job queue schema installed");

    const db = drizzle(pool, { schema: { ...schema, ...relations } });
    // The registries follow the modules' declarations: a new type, field, role or step is a code change only
    await StoredRegistries.reconcile(db);
    console.log("Registries synced with the modules' declarations");

    await applyPackages(db);
    console.log("Content packages applied successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

await main();
// A package's install reads views through the server's own pool, which stays open: the run ends here, not when it
// idles out
process.exit(0);
