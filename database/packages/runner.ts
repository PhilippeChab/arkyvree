import { eq } from "drizzle-orm";
import { contentPackagesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { registry } from "@/database/packages/registry.ts";

export async function applyPackages(db: Db) {
  const applied = await db
    .select({ name: contentPackagesInRules.name, version: contentPackagesInRules.version })
    .from(contentPackagesInRules);

  const appliedMap = new Map(applied.map((row) => [row.name, row.version]));

  for (const pkg of registry) {
    const appliedVersion = appliedMap.get(pkg.name);

    if (appliedVersion === undefined) {
      console.log(`  Installing ${pkg.name} v${pkg.version}...`);

      await db.transaction(async (tx) => {
        for (const seed of pkg.seeds) {
          await seed(tx);
        }

        // Seeds establish v1; apply incremental updates for v2+
        for (let v = 2; v <= pkg.version; v++) {
          const updateFn = pkg.updates?.[v];
          if (!updateFn) {
            throw new Error(`${pkg.name}: missing update function for version ${v}`);
          }
          await updateFn(tx);
        }

        await tx.insert(contentPackagesInRules).values({
          name: pkg.name,
          type: pkg.type,
          version: pkg.version,
        });
      });

      console.log(`  ✓ ${pkg.name} v${pkg.version} installed`);
    } else if (appliedVersion < pkg.version) {
      console.log(`  Updating ${pkg.name} v${appliedVersion} → v${pkg.version}...`);

      await db.transaction(async (tx) => {
        for (let v = appliedVersion + 1; v <= pkg.version; v++) {
          const updateFn = pkg.updates?.[v];
          if (!updateFn) {
            throw new Error(`${pkg.name}: missing update function for version ${v}`);
          }
          await updateFn(tx);
        }

        await tx
          .update(contentPackagesInRules)
          .set({ version: pkg.version, appliedAt: new Date() })
          .where(eq(contentPackagesInRules.name, pkg.name));
      });

      console.log(`  ✓ ${pkg.name} updated to v${pkg.version}`);
      console.log(`    ⚠ Restart any running server: in-memory ruleset cache is stale until reboot.`);
    } else {
      console.log(`  ✓ ${pkg.name} v${appliedVersion} already up to date`);
    }
  }
}
