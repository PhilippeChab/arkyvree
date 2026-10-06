/** Resets the local database DATABASE_URL names: emptied, migrated as production does, and seeded. */
import resetDatabase from "@/scripts/db/resetDatabase.ts";

async function main() {
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
  await resetDatabase(args.includes("--with-test-data"));
  console.log("Database reset completed!");
  process.exit(0);
}

await main();
