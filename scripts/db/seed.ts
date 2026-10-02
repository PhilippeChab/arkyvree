import { applyPackages } from "@/database/packages/runner.ts";
import testSeeds from "@/database/seeds/index.ts";
import type { Db } from "@/server/database/index.ts";

/** Applies the content packages to `db`, then, when `includeTestSeeds`, the test data's seeds (reset.ts). */
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
