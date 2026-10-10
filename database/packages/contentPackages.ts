import type { PackageDefinition } from "@/content/core/builders/packages/types.ts";
import type { Db } from "@/server/database/index.ts";

import type { ContentPackage } from "./types.ts";

/**
 * The runner's package of a package's definition (`content/<ruleset>/packages/`): its name, type and version, and the
 * seed that writes its content, its ruleset's seeder's (`seed`).
 */
export function toContentPackage<D extends PackageDefinition>(
  definition: D,
  seed: (db: Db, definition: D) => Promise<void>,
): ContentPackage {
  const { name, seedsVersion, type } = definition;
  return { name, seedsVersion, type, seeds: [(db) => seed(db, definition)] };
}
