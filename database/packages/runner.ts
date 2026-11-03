import { eq, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { RULESET_LOCK_ORDER } from "@/drizzle/lockOrder.ts";
import { contentPackagesInRules, rulesetsInRules } from "@/drizzle/schema.ts";

import { CONTENT_PACKAGES } from "./registry.ts";
import type { ContentPackage } from "./types.ts";

/**
 * A database's version of a package below its seeds can't be brought up to date: the updates it lacks were folded
 * into the seeds.
 */
function refusal(pkg: ContentPackage, applied: number | undefined) {
  return applied !== undefined && applied < pkg.seedsVersion
    ? `${pkg.name} is at v${applied}, below its seeds (v${pkg.seedsVersion}), which contain the updates it lacks`
    : undefined;
}

/** A package's updates in version order, checked to follow its seeds without a gap. */
function updatesOf(pkg: ContentPackage) {
  const versions = Object.keys(pkg.updates ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  for (const [i, version] of versions.entries()) {
    if (version !== pkg.seedsVersion + i + 1)
      throw new Error(`${pkg.name}: update v${version} doesn't follow v${pkg.seedsVersion + i}`);
  }
  return versions.map((version) => ({ version, update: pkg.updates![version] }));
}

/**
 * Locks the system rulesets until the transaction ends, in the order every lock of several takes
 * (`RULESET_LOCK_ORDER`: extensions before bases, then by id), so it waits on their writes and never on one in a
 * cycle.
 */
async function lockSystemRulesets(tx: Db) {
  await tx
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.system, true))
    .orderBy(RULESET_LOCK_ORDER)
    .for("no key update");
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
export async function applyPackages(db: Db, packages: ContentPackage[] = CONTENT_PACKAGES) {
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
      // An update changes the system rulesets' rows while a server runs: locked first, in the order every lock of
      // several takes, so no write of theirs runs meanwhile, and their versions bumped, so the next write reads them
      // fresh rather than trust the rows its process pinned (`RulesetViews`)
      if (from !== undefined) await lockSystemRulesets(tx);

      if (from === undefined) for (const seed of pkg.seeds) await seed(tx);

      for (const { update } of updates.filter((u) => u.version > (from ?? pkg.seedsVersion))) await update(tx);
      if (from !== undefined) {
        await tx
          .update(rulesetsInRules)
          .set({ contentVersion: sql`${rulesetsInRules.contentVersion} + 1` })
          .where(eq(rulesetsInRules.system, true));
      }

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
