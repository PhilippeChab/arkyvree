import { and, eq } from "drizzle-orm";

import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import type { Db } from "@/drizzle/database.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";

import { RulesetSeeder } from "./RulesetSeeder.ts";

/**
 * A 3.5 extension's update (`pkg`'s) to its book's epic content, after the core rules' v2: its own epic feats, flagged
 * epic, and its feats listed where its book lists them now, its fighter bonus feats in the epic fighter's list too, its
 * copies of core feats where the core feats are now (`RulesetSeeder.updateExtension`), in a context naming the core
 * rules' rows and, over them, its own.
 */
export function addEpicContent(pkg: ExtensionPackage) {
  return async (db: Db) => {
    const coreId = await RulesetSeeder.findCoreRulesetId(db, DND35_CORE_PACKAGE, pkg.ruleset.name);
    const [extension] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(and(eq(rulesetsInRules.name, pkg.ruleset.name), eq(rulesetsInRules.system, true)));
    if (!extension) throw new Error(`${pkg.ruleset.name} isn't seeded`);
    const core = await RulesetSeeder.loadContext(db, coreId);
    const own = await RulesetSeeder.loadContext(db, extension.id);
    const seeder = new RulesetSeeder(db, {
      ...RulesetSeeder.extensionContext(core, extension.id),
      aptMap: { ...core.aptMap, ...own.aptMap },
      featMap: { ...core.featMap, ...own.featMap },
    });
    await seeder.updateExtension(pkg.content, core.featMap, own.featMap);
  };
}

/**
 * The 3.5 core rules' v2: what their content gained since v1, the core classes' levels 21st to 40th (the SRD's epic
 * progressions) with their epic bonus feats, their pools and the feats listed in them (`RulesetSeeder.updateCore`).
 */
export async function addEpicLevels(db: Db) {
  const rulesetId = await RulesetSeeder.findCoreRulesetId(db, DND35_CORE_PACKAGE, "The core classes' epic levels");
  const seeder = new RulesetSeeder(db, await RulesetSeeder.loadContext(db, rulesetId));
  await seeder.updateCore(DND35_CORE_PACKAGE.content);
}
