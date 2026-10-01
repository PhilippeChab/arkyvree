import { eq } from "drizzle-orm";

import { registry } from "@/database/packages/registry.ts";
import type { ContentPackage } from "@/database/packages/types.ts";
import { contentPackagesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/** A package's updates in version order, checked to follow its seeds without a gap. */
function updatesOf(pkg: ContentPackage) {
  const versions = Object.keys(pkg.updates ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  for (const [i, version] of versions.entries()) {
    if (version !== pkg.seedsVersion + i + 1) {
      throw new Error(`${pkg.name}: update v${version} doesn't follow v${pkg.seedsVersion + i}`);
    }
  }
  return versions.map((version) => ({ version, update: pkg.updates![version] }));
}

/**
 * A database's version of a package below its seeds can't be brought up to date: the updates it lacks were folded
 * into the seeds.
 */
function refusal(pkg: ContentPackage, applied: number | undefined) {
  return applied !== undefined && applied < pkg.seedsVersion
    ? `${pkg.name} is at v${applied}, below its seeds (v${pkg.seedsVersion}), which contain the updates it lacks`
    : undefined;
}

/**
 * What applying the packages does to a database at the `applied` versions: each package's updates, and the version
 * they bring it to. And what stops it, by package: updates that don't follow the seeds, or a database below them.
 * The runner applies no package while there's a problem.
 */
export function planPackages(packages: ContentPackage[], applied: Map<string, number>) {
  const plans: { pkg: ContentPackage; updates: ReturnType<typeof updatesOf>; version: number }[] = [];
  const problems = new Map<string, string[]>();
  for (const pkg of packages) {
    const found = [refusal(pkg, applied.get(pkg.name))].filter((problem) => problem !== undefined);
    try {
      const updates = updatesOf(pkg);
      plans.push({ pkg, updates, version: updates.at(-1)?.version ?? pkg.seedsVersion });
    } catch (error) {
      found.push(error instanceof Error ? error.message : String(error));
    }
    if (found.length > 0) problems.set(pkg.name, found);
  }
  return { plans, problems };
}

/** Installs the packages missing from the database, and brings the others up to date, or applies none (`planPackages`). */
export async function applyPackages(db: Db, packages: ContentPackage[] = registry) {
  const applied = new Map(
    (
      await db
        .select({ name: contentPackagesInRules.name, version: contentPackagesInRules.version })
        .from(contentPackagesInRules)
    ).map((row) => [row.name, row.version]),
  );

  const { plans, problems } = planPackages(packages, applied);
  if (problems.size > 0) {
    throw new Error(
      [
        "No package applied:",
        ...[...problems.values()].flat().map((line) => `  - ${line}`),
        "A database below a package's seeds needs those updates back (from git history) until it has them, or a reset if it's a development one.",
      ].join("\n"),
    );
  }

  for (const { pkg, updates, version } of plans) {
    const from = applied.get(pkg.name);

    if (from !== undefined && from >= version) {
      console.log(`  ✓ ${pkg.name} v${from} already up to date`);
      continue;
    }

    console.log(
      from === undefined
        ? `  Installing ${pkg.name} v${version}...`
        : `  Updating ${pkg.name} v${from} → v${version}...`,
    );
    await db.transaction(async (tx) => {
      if (from === undefined) {
        for (const seed of pkg.seeds) await seed(tx);
      }
      for (const { update } of updates.filter((u) => u.version > (from ?? pkg.seedsVersion))) await update(tx);

      if (from === undefined) {
        await tx.insert(contentPackagesInRules).values({ name: pkg.name, type: pkg.type, version });
      } else {
        await tx
          .update(contentPackagesInRules)
          .set({ version, appliedAt: new Date() })
          .where(eq(contentPackagesInRules.name, pkg.name));
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
