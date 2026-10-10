import type { PackageDefinition } from "@/content/core/builders/packages/types.ts";
import { BASE_RULES_OPTIONS, type BaseRules } from "@/shared/enums.ts";

import type { ContentPackage, RulesetContent } from "./types.ts";

/**
 * A base rules' packages, as the runner applies them: its core rules', which create its core ruleset, then its
 * extensions' of it, found by its core package, each seeded by its seeder, and with its updates (by package name).
 */
function packagesOf(baseRules: BaseRules, { core, extensions, seeder: Seeder, updates = {} }: RulesetContent) {
  const packages = [
    toContentPackage(core, async (db) => {
      const seeder = await Seeder.createCore(db, baseRules, core.ruleset);
      await seeder.seedCore(core.content);
    }),
    ...extensions.map((extension) =>
      toContentPackage(extension, async (db) => {
        const base = await Seeder.loadContext(db, await Seeder.findCoreRulesetId(db, core, extension.ruleset.name));
        const seeder = await Seeder.createExtension(db, baseRules, extension.ruleset, base);
        await seeder.seedExtension(extension.content, core.content);
      }),
    ),
  ];
  const unknown = Object.keys(updates).filter((name) => !packages.some((pkg) => pkg.name === name));
  if (unknown.length > 0) throw new Error(`${baseRules} updates packages it doesn't have: ${unknown.join(", ")}`);
  return packages.map((pkg) => ({ ...pkg, updates: updates[pkg.name] }));
}

/** The runner's package of a package's definition: its name, type and version, and the seed that writes its content. */
function toContentPackage(
  { name, seedsVersion, type }: PackageDefinition,
  seed: ContentPackage["seeds"][number],
): ContentPackage {
  return { name, seedsVersion, type, seeds: [seed] };
}

/**
 * The packages of the registry's base rules (`registry`), in the order the runner applies them: each base rules' core
 * rules, then its extensions.
 */
export function listContentPackages(registry: Record<BaseRules, RulesetContent>): ContentPackage[] {
  return BASE_RULES_OPTIONS.flatMap((baseRules) => packagesOf(baseRules, registry[baseRules]));
}
