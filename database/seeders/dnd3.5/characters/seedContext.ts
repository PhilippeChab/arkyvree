/** What a seeder reads from a base rules' core ruleset: its entities' ids by name, its races' and classes' by kind too. */

import { and, eq } from "drizzle-orm";

import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { SeederState } from "@/database/seeders/core/SeederState.ts";
import { Dnd35ContentSeeder, type Dnd35SeedContext } from "@/database/seeders/dnd3.5/Dnd35ContentSeeder.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";

/** The seeded core rules' ids by name: its seed context, and the languages, races, classes and items characters name. */
export type SeedContext = Dnd35SeedContext & {
  /** Class id by kind, then name. Use `classMap.pc["Fighter"]`, `classMap.familiar["Familiar"]`. */
  classMap: Record<string, Record<string, string>>;
  itemMap: Record<string, string>;
  langMap: Record<string, string>;
  /** Race id by kind, then name. Use `raceMap.pc["Human"]`, `raceMap.familiar["Owl"]`. */
  raceMap: Record<string, Record<string, string>>;
};

/**
 * Group kinded rows (races, classes) by kind, then by name. Callers spell out
 * which kind they want (`ctx.raceMap.pc["Human"]`, `ctx.raceMap.familiar["Owl"]`)
 * so name collisions between e.g. familiar-kind and animalcompanion-kind rows
 * resolve unambiguously at the call site.
 */
function buildKindMap(rows: { id: string; kind: string; name: string }[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) (out[row.kind] ??= {})[row.name] = row.id;

  return out;
}

/** The seed context of the 3.5 core ruleset, which its core package seeds. */
export async function getSeedContext(db: Db): Promise<SeedContext> {
  const rulesetId = await Dnd35ContentSeeder.findCoreRulesetId(db, DND35_CORE_PACKAGE, "The test data");
  // One after the other: a transaction runs one query at a time.
  const names = await Dnd35ContentSeeder.loadContext(db, rulesetId);
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
  const classes = await named("classes");
  const items = await named("items");
  return {
    ...names,
    langMap: SeederState.idsByName(langs),
    raceMap: buildKindMap(races),
    classMap: buildKindMap(classes),
    itemMap: SeederState.idsByName(items),
  };
}
