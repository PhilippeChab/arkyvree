/** What a seeder reads from the core ruleset: its entities' ids by name, its races' and classes' by kind too. */

import { eq } from "drizzle-orm";

import {
  coreRulesetId,
  idsByName,
  loadSeedContext,
  type SeedContext as RulesetSeedContext,
} from "@/database/packages/dnd35/seed/context.ts";
import { itemsInRules, klassesInRules, languagesInRules, racesInRules } from "@/drizzle/schema.ts";
import { type Db } from "@/server/database/index.ts";

/** The seeded core rules' ids by name: its seed context, and the languages, races, classes and items characters name. */
export type SeedContext = RulesetSeedContext & {
  langMap: Record<string, string>;
  /** Race id by kind, then name. Use `raceMap.pc["Human"]`, `raceMap.familiar["Owl"]`. */
  raceMap: Record<string, Record<string, string>>;
  /** Klass id by kind, then name. Use `klassMap.pc["Fighter"]`, `klassMap.familiar["Familiar"]`. */
  klassMap: Record<string, Record<string, string>>;
  itemMap: Record<string, string>;
};

/**
 * Group kinded rows (races, klasses) by kind, then by name. Callers spell out
 * which kind they want (`ctx.raceMap.pc["Human"]`, `ctx.raceMap.familiar["Owl"]`)
 * so name collisions between e.g. familiar-kind and animalcompanion-kind rows
 * resolve unambiguously at the call site.
 */
function buildKindMap(rows: { name: string; id: string; kind: string }[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    (out[row.kind] ??= {})[row.name] = row.id;
  }
  return out;
}

export async function getSeedContext(db: Db): Promise<SeedContext> {
  const rulesetId = await coreRulesetId(db, "The test data");
  // One after the other: a transaction runs one query at a time.
  const names = await loadSeedContext(db, rulesetId);
  const langs = await db
    .select({ id: languagesInRules.id, name: languagesInRules.name })
    .from(languagesInRules)
    .where(eq(languagesInRules.rulesetId, rulesetId));
  const races = await db
    .select({ id: racesInRules.id, name: racesInRules.name, kind: racesInRules.kind })
    .from(racesInRules)
    .where(eq(racesInRules.rulesetId, rulesetId));
  const klasses = await db
    .select({ id: klassesInRules.id, name: klassesInRules.name, kind: klassesInRules.kind })
    .from(klassesInRules)
    .where(eq(klassesInRules.rulesetId, rulesetId));
  const items = await db
    .select({ id: itemsInRules.id, name: itemsInRules.name })
    .from(itemsInRules)
    .where(eq(itemsInRules.rulesetId, rulesetId));
  return {
    ...names,
    langMap: idsByName(langs),
    raceMap: buildKindMap(races),
    klassMap: buildKindMap(klasses),
    itemMap: idsByName(items),
  };
}
