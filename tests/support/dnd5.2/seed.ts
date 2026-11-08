import { getSeedContext, type SeedContext } from "@/database/seeders/dnd5.2/characters/seedContext.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";

let seedContext: Promise<SeedContext> | undefined;

/**
 * Ids of the seeded D&D 5th Edition core rules ("Core SRD 5.2"), by name: its seed context, and its backgrounds,
 * classes, items, languages and species, as its test characters' seed reads them. Loaded once per test process.
 */
export function getDnd52SeedCtx() {
  seedContext ??= getSeedContext(db);
  return seedContext;
}

/**
 * The other base rules' seeded core rules (3.5's and Pathfinder's), which a D&D 5th Edition test reads without naming
 * their folders: each system base ruleset of another base rules.
 */
export async function findOtherCoreRulesets() {
  return (await Rulesets.findMany(db, { system: true })).filter(
    ({ baseRules, kind, rulesetId }) => kind === "ruleset" && rulesetId === null && baseRules !== DND52_BASE_RULES,
  );
}
