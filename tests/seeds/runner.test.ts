import { afterAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { applyPackages } from "@/database/packages/runner.ts";
import type { ContentPackage } from "@/database/packages/types.ts";
import { contentPackagesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";

const pool = createTestPool();

function record(pkg: ContentPackage, version: number) {
  return db.insert(contentPackagesInRules).values({ name: pkg.name, type: pkg.type, version });
}

/** A package whose seeds and updates record that they ran, in `ran`. */
function testPackage(seedsVersion: number, updateVersions: number[], ran: string[]): ContentPackage {
  const name = `test-package-${uniqueId()}`;
  return {
    name,
    type: "extension",
    seedsVersion,
    seeds: [async () => void ran.push(`${name} seeds`)],
    updates: Object.fromEntries(
      updateVersions.map((version) => [version, async () => void ran.push(`${name} v${version}`)]),
    ),
  };
}

async function recordedVersion(name: string) {
  return (
    await db
      .select({ version: contentPackagesInRules.version })
      .from(contentPackagesInRules)
      .where(eq(contentPackagesInRules.name, name))
  )[0]?.version;
}

/** The system rulesets' content versions, by id. */
async function systemVersions() {
  const systemIds = (await Rulesets.findMany(db, { system: true })).map((ruleset) => ruleset.id);
  return await Rulesets.findVersions(db, { ids: systemIds });
}

afterAll(() => pool.end());

describe("Applying content packages", () => {
  test("installs a new package: its seeds, then every update, at its last update's version", async () => {
    const ran: string[] = [];
    const pkg = testPackage(3, [4, 5], ran);
    await applyPackages(db, [pkg]);
    expect(ran).toEqual([`${pkg.name} seeds`, `${pkg.name} v4`, `${pkg.name} v5`]);
    expect(await recordedVersion(pkg.name)).toBe(5);
  });

  test("brings an installed package up to date with the updates past its version", async () => {
    const ran: string[] = [];
    const pkg = testPackage(3, [4, 5], ran);
    await record(pkg, 4);
    await applyPackages(db, [pkg]);
    expect(ran).toEqual([`${pkg.name} v5`]);
    expect(await recordedVersion(pkg.name)).toBe(5);
  });

  test("updates an installed package once a write to a system ruleset ends, its versions bumped", async () => {
    let released = false;
    let updatedAfterRelease: boolean | undefined;
    const pkg = { ...testPackage(3, [], []), updates: { 4: async () => void (updatedAfterRelease = released) } };
    await record(pkg, 3);
    const before = await systemVersions();
    // A write to the base holds its lock: the update waits for it before it changes anything, then bumps every system
    // ruleset's version, so the next write reads their rows fresh
    await runWhileLocked(
      pool,
      async (blockerDb) => Rulesets.lockContent(blockerDb, { id: (await getSeedCtx()).rulesetId }),
      () => applyPackages(db, [pkg]),
      () => (released = true),
    );
    expect(updatedAfterRelease).toBe(true);
    expect(await systemVersions()).toEqual(new Map([...before].map(([id, version]) => [id, version + 1])));
  });

  test("installs a new package without bumping the system rulesets' versions", async () => {
    const before = await systemVersions();
    await applyPackages(db, [testPackage(3, [], [])]);
    expect(await systemVersions()).toEqual(before);
  });

  test("leaves an up-to-date package alone", async () => {
    const ran: string[] = [];
    const pkg = testPackage(3, [], ran);
    await record(pkg, 3);
    await applyPackages(db, [pkg]);
    expect(ran).toEqual([]);
  });

  test("applies no package when one is below its seeds, and names every such package", async () => {
    const ran: string[] = [];
    const fresh = testPackage(1, [], ran);
    const [stale, staler] = [testPackage(3, [], ran), testPackage(6, [7], ran)];
    await record(stale, 2);
    await record(staler, 5);
    const error = await applyPackages(db, [fresh, stale, staler]).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain(`${stale.name} is at v2, below its seeds (v3)`);
    expect(String(error)).toContain(`${staler.name} is at v5, below its seeds (v6)`);
    expect(ran).toEqual([]);
    expect(await recordedVersion(fresh.name)).toBeUndefined();
  });

  test("applies no package when one's updates don't follow its seeds without a gap, and reports it with the refusals", async () => {
    const ran: string[] = [];
    const [fresh, gapped, stale, both] = [
      testPackage(1, [], ran),
      testPackage(3, [5], ran),
      testPackage(3, [], ran),
      testPackage(3, [5], ran),
    ];
    await record(stale, 2);
    await record(both, 2);
    const error = await applyPackages(db, [fresh, gapped, stale, both]).catch((e: Error) => e);
    expect(String(error)).toContain(`${gapped.name}: update v5 doesn't follow v3`);
    expect(String(error)).toContain(`${stale.name} is at v2, below its seeds (v3)`);
    expect(String(error)).toContain(`${both.name}: update v5 doesn't follow v3`);
    expect(String(error)).toContain(`${both.name} is at v2, below its seeds (v3)`);
    expect(ran).toEqual([]);
    expect(await recordedVersion(fresh.name)).toBeUndefined();
  });
});
