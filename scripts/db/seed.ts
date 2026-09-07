import type { Db } from "@/server/database/production.ts";
import { db as defaultDb } from "@/server/database/index.ts";
import { applyPackages } from "@/database/packages/runner.ts";
import testSeeds from "@/database/seeds/index.ts";

export default async function seedDatabase(db: Db, includeTestSeeds: boolean = true) {
  console.log("Applying content packages...");
  await applyPackages(db);
  console.log("✓ Content packages applied");

  if (includeTestSeeds) {
    console.log("Seeding test data...");
    for (const seed of testSeeds) {
      await seed(db);
    }
    console.log("  ✓ Test data seeded");
  }

  console.log("Database seeded successfully.");
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/db/seed.ts [options]

Options:
  --with-test-data    Include test data seeds
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  const includeTestSeeds = args.includes("--with-test-data");
  await seedDatabase(defaultDb, includeTestSeeds);
  process.exit(0);
}
