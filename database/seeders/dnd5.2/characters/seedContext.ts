/** What a seeder reads from the D&D 5th Edition core ruleset: its entities' ids by name. */

import { and, eq } from "drizzle-orm";

import { DND52_CORE_PACKAGE } from "@/content/dnd5.2/packages/core.ts";
import { SeederState } from "@/database/seeders/core/SeederState.ts";
import { Dnd52ContentSeeder, type Dnd52SeedContext } from "@/database/seeders/dnd5.2/Dnd52ContentSeeder.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";

/**
 * The seeded core rules' ids by name: its seed context, and the backgrounds, classes, items, languages and species
 * characters name.
 */
export type SeedContext = Dnd52SeedContext & {
  backgroundMap: Record<string, string>;
  classMap: Record<string, string>;
  itemMap: Record<string, string>;
  langMap: Record<string, string>;
  speciesMap: Record<string, string>;
};

/** The seed context of the D&D 5th Edition core ruleset, which its core package seeds. */
export async function getSeedContext(db: Db): Promise<SeedContext> {
  const rulesetId = await Dnd52ContentSeeder.findCoreRulesetId(db, DND52_CORE_PACKAGE, "The test data");
  // One after the other: a transaction runs one query at a time.
  const names = await Dnd52ContentSeeder.loadContext(db, rulesetId);
  const named = async (type: string) =>
    SeederState.idsByName(
      (await db
        .select({ id: entitiesInRules.id, name: entitiesInRules.name })
        .from(entitiesInRules)
        .where(and(eq(entitiesInRules.type, type), eq(entitiesInRules.rulesetId, rulesetId)))) as {
        id: string;
        name: string;
      }[],
    );
  const langMap = await named("languages");
  const speciesMap = await named("species");
  const backgroundMap = await named("backgrounds");
  const classMap = await named("classes");
  const itemMap = await named("items");
  return { ...names, backgroundMap, classMap, itemMap, langMap, speciesMap };
}
