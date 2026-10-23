import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
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
  // A migration says what it checked and what it found (0080's checks, the descriptions it drops): node-postgres drops
  // a notice nothing listens for
  pool.on("connect", (client) => client.on("notice", (notice) => console.log(`  ${notice.message}`)));

  try {
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully");

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
