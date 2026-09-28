import { eq } from "drizzle-orm";
import { contentPackagesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { registry } from "@/database/packages/registry.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

/** A package's updates in version order, checked to follow its seeds without a gap. */
function updatesOf(pkg: ContentPackage) {
  const versions = Object.keys(pkg.updates ?? {}).map(Number).sort((a, b) => a - b);
  for (const [i, version] of versions.entries()) {
    if (version !== pkg.seedsVersion + i + 1) {
      throw new Error(`${pkg.name}: update v${version} doesn't follow v${pkg.seedsVersion + i}`);
    }
  }
  return versions.map((version) => ({ version, update: pkg.updates![version] }));
}

/** The version a package's code brings a database to: its last update's, or its seeds'. */
export const packageVersion = (pkg: ContentPackage) => updatesOf(pkg).at(-1)?.version ?? pkg.seedsVersion;

/**
 * A database's version of a package below its seeds can't be brought up to date: the updates it lacks were folded
 * into the seeds. Undefined when there's nothing to refuse.
 */
export function refusal(pkg: ContentPackage, applied: number | undefined) {
  return applied !== undefined && applied < pkg.seedsVersion ? `${pkg.name} v${applied} (its seeds are v${pkg.seedsVersion})` : undefined;
}

/**
 * Installs the packages missing from the database, and brings the others up to date. It applies none when one is
 * below its seeds (`refusal`).
 */
export async function applyPackages(db: Db, packages: ContentPackage[] = registry) {
  const applied = new Map(
    (await db.select({ name: contentPackagesInRules.name, version: contentPackagesInRules.version }).from(contentPackagesInRules))
      .map((row) => [row.name, row.version]),
  );

  const refused = packages.map((pkg) => refusal(pkg, applied.get(pkg.name))).filter((line) => line !== undefined);
  if (refused.length > 0) {
    throw new Error([
      "No package applied: these are below their seeds, which now contain the updates they lack:",
      ...refused.map((line) => `  - ${line}`),
      "Reset a development database. Any other needs those updates back (from git history) until it has them.",
    ].join("\n"));
  }

  for (const pkg of packages) {
    const updates = updatesOf(pkg);
    const version = packageVersion(pkg);
    const from = applied.get(pkg.name);

    if (from !== undefined && from >= version) {
      console.log(`  ✓ ${pkg.name} v${from} already up to date`);
      continue;
    }

    console.log(from === undefined ? `  Installing ${pkg.name} v${version}...` : `  Updating ${pkg.name} v${from} → v${version}...`);
    await db.transaction(async (tx) => {
      if (from === undefined) {
        for (const seed of pkg.seeds) await seed(tx);
      }
      for (const { update } of updates.filter((u) => u.version > (from ?? pkg.seedsVersion))) await update(tx);

      if (from === undefined) {
        await tx.insert(contentPackagesInRules).values({ name: pkg.name, type: pkg.type, version });
      } else {
        await tx.update(contentPackagesInRules).set({ version, appliedAt: new Date() }).where(eq(contentPackagesInRules.name, pkg.name));
      }
    });

    if (from === undefined) {
      console.log(`  ✓ ${pkg.name} v${version} installed`);
    } else {
      console.log(`  ✓ ${pkg.name} updated to v${version}`);
      console.log(`    ⚠ Restart any running server: in-memory ruleset cache is stale until reboot.`);
    }
  }
}
