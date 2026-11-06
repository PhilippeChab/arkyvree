import { and, eq } from "drizzle-orm";

import { PF1_CORE_PACKAGE } from "@/content/pf1/packages/core.ts";
import { Pf1ContentSeeder, type Pf1SeedContext } from "@/database/seeders/pf1/Pf1ContentSeeder.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

/** The seeded Pathfinder core rules' ids by name: its seed context, and its races, classes and languages. */
export type Pf1SeedCtx = Pf1SeedContext & {
  /** Class id by kind, then name: `classMap.pc["Wizard"]`, `classMap.familiar["Familiar"]`. */
  classMap: Record<string, Record<string, string>>;
  langMap: Record<string, string>;
  /** Race id by kind, then name: `raceMap.pc["Human"]`, `raceMap.familiar["Cat"]`. */
  raceMap: Record<string, Record<string, string>>;
};

let seedContext: Promise<Pf1SeedCtx> | undefined;

/** Rows grouped by kind (a race's or a class's partition), then by name. */
function byKind(rows: { id: string; kind: string; name: string }[]) {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) (out[row.kind] ??= {})[row.name] = row.id;
  return out;
}

/** The seeded Pathfinder core rules' ids, read once: one after the other, as a transaction runs one query at a time. */
async function readSeedContext(): Promise<Pf1SeedCtx> {
  const rulesetId = await Pf1ContentSeeder.findCoreRulesetId(db, PF1_CORE_PACKAGE, "The Pathfinder tests");
  const names = await Pf1ContentSeeder.loadContext(db, rulesetId);
  const named = async (type: string) =>
    (await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name, kind: entitiesInRules.partition })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, type), eq(entitiesInRules.rulesetId, rulesetId)))) as {
      id: string;
      kind: string;
      name: string;
    }[];
  const languages = await named("languages");
  const races = await named("races");
  const classes = await named("classes");
  return {
    ...names,
    classMap: byKind(classes),
    langMap: Object.fromEntries(languages.map(({ id, name }) => [name, id])),
    raceMap: byKind(races),
  };
}

/** Ids of the seeded Pathfinder core rules ("Core PSD 1"), by name. Loaded once per test process. */
export function getPf1SeedCtx() {
  seedContext ??= readSeedContext();
  return seedContext;
}

/**
 * The other base rules' seeded core rules (3.5's), which a Pathfinder test reads without naming their folders: the one
 * system base ruleset of another base rules, and its entities' ids of a kind by name.
 */
export async function findOtherCoreRules() {
  const others = (await Rulesets.findMany(db, { system: true })).filter(
    ({ baseRules, kind, rulesetId }) => kind === "ruleset" && rulesetId === null && baseRules !== PF1_BASE_RULES,
  );
  if (others.length !== 1) throw new Error(`${others.length} other base rulesets are seeded, not one`);
  const [ruleset] = others;
  const idOf = async (type: string, name: string) => {
    const [row] = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(
        and(eq(entitiesInRules.type, type), eq(entitiesInRules.rulesetId, ruleset.id), eq(entitiesInRules.name, name)),
      );
    if (!row) throw new Error(`No ${type} ${name} in ${ruleset.name}`);
    return row.id;
  };
  return { idOf, ruleset };
}
