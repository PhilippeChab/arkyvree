import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { applyPackages } from "@/database/packages/runner.ts";
import type { ContentPackage } from "@/database/packages/types.ts";
import { contentPackagesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { uniqueId } from "@/tests/helpers.ts";

/** A package whose seeds and updates record that they ran, in `ran`. */
function testPackage(seedsVersion: number, updateVersions: number[], ran: string[]): ContentPackage {
  const name = `test-package-${uniqueId()}`;
  return {
    name,
    type: "extension",
    seedsVersion,
    seeds: [async () => void ran.push(`${name} seeds`)],
    updates: Object.fromEntries(updateVersions.map((version) => [version, async () => void ran.push(`${name} v${version}`)])),
  };
}

const recordedVersion = async (name: string) =>
  (await db.select({ version: contentPackagesInRules.version }).from(contentPackagesInRules).where(eq(contentPackagesInRules.name, name)))[0]?.version;

const record = (pkg: ContentPackage, version: number) => db.insert(contentPackagesInRules).values({ name: pkg.name, type: pkg.type, version });

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
    expect(String(error)).toContain(`${stale.name} v2 (its seeds are v3)`);
    expect(String(error)).toContain(`${staler.name} v5 (its seeds are v6)`);
    expect(ran).toEqual([]);
    expect(await recordedVersion(fresh.name)).toBeUndefined();
  });

  test("refuses updates that don't follow the seeds without a gap", async () => {
    const ran: string[] = [];
    const pkg = testPackage(3, [5], ran);
    await expect(applyPackages(db, [pkg])).rejects.toThrow(`${pkg.name}: update v5 doesn't follow v3`);
  });
});
