/** What a seeder reads from a base rules' core ruleset: its entities' ids by name, its races' and classes' by kind too. */

import { and, eq } from "drizzle-orm";

import { RULESET_CONTENT } from "@/database/packages/registry.ts";
import { ContentSeeder } from "@/database/seeders/core/ContentSeeder.ts";
import type { SeedContext as RulesetSeedContext } from "@/database/seeders/core/SeederState.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** The seeded core rules' ids by name: its seed context, and the languages, races, classes and items characters name. */
export type SeedContext = RulesetSeedContext & {
  itemMap: Record<string, string>;
  /** Klass id by kind, then name. Use `klassMap.pc["Fighter"]`, `klassMap.familiar["Familiar"]`. */
  klassMap: Record<string, Record<string, string>>;
  langMap: Record<string, string>;
  /** Race id by kind, then name. Use `raceMap.pc["Human"]`, `raceMap.familiar["Owl"]`. */
  raceMap: Record<string, Record<string, string>>;
};

/**
 * Group kinded rows (races, klasses) by kind, then by name. Callers spell out
 * which kind they want (`ctx.raceMap.pc["Human"]`, `ctx.raceMap.familiar["Owl"]`)
 * so name collisions between e.g. familiar-kind and animalcompanion-kind rows
 * resolve unambiguously at the call site.
 */
function buildKindMap(rows: { id: string; kind: string; name: string }[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) (out[row.kind] ??= {})[row.name] = row.id;

  return out;
}

/** The seed context of the core ruleset `baseRules`' core package seeds (its row of the registry). */
export async function getSeedContext(db: Db, baseRules: BaseRules): Promise<SeedContext> {
  const rulesetId = await ContentSeeder.findCoreRulesetId(db, RULESET_CONTENT[baseRules].core, "The test data");
  // One after the other: a transaction runs one query at a time.
  const names = await ContentSeeder.loadContext(db, rulesetId);
  // Each type's entities, by name and by their partition (a race's or a class's kind)
  const named = async (type: string) =>
    (await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name, kind: entitiesInRules.partition })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, type), eq(entitiesInRules.rulesetId, rulesetId)))) as {
      id: string;
      kind: string;
      name: string;
    }[];
  const langs = await named("languages");
  const races = await named("races");
  const klasses = await named("klasses");
  const items = await named("items");
  return {
    ...names,
    langMap: ContentSeeder.idsByName(langs),
    raceMap: buildKindMap(races),
    klassMap: buildKindMap(klasses),
    itemMap: ContentSeeder.idsByName(items),
  };
}
