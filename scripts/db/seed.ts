import { applyPackages } from "@/database/packages/runner.ts";
import testSeeds from "@/database/seeds/index.ts";
import { type Db, db as defaultDb } from "@/server/database/index.ts";

/** Applies the content packages to `db`, then, when `includeTestSeeds`, the test data's seeds. */
export default async function seedDatabase(db: Db, includeTestSeeds: boolean) {
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

/** Whether a seed or reset script was asked for the test data (`--with-test-data`); its usage, and exits, on `--help`. */
export function includeTestSeedsOption(script: "seed" | "reset"): boolean {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/db/${script}.ts [options]

Options:
  --with-test-data    Include test data seeds
  --help, -h          Show this help message
`);
    process.exit(0);
  }
  return args.includes("--with-test-data");
}

if (import.meta.main) {
  await seedDatabase(defaultDb, includeTestSeedsOption("seed"));
  process.exit(0);
}
