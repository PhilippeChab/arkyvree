import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import { applyPackages } from "@/database/packages/runner.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const migrationDb = drizzle(pool);
  await migrate(migrationDb, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully");

  const db = drizzle(pool, { schema: { ...schema, ...relations } });
  await applyPackages(db);
  console.log("Content packages applied successfully");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
} finally {
  await pool.end();
}
