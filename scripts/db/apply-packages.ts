import { db } from "@/server/database/index.ts";
import { applyPackages } from "@/database/packages/runner.ts";

console.log("Applying content packages...");
await applyPackages(db);
console.log("Done.");
process.exit(0);
