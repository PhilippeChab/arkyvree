import { and, eq, isNull } from "drizzle-orm";

import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  powersInRules,
  rulesetExtensionsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

type Ids = Record<string, string>;

/**
 * The ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or
 * powers adds them, so the steps after can name them.
 */
export type SeedContext = {
  rulesetId: string;
  abilityMap: Ids;
  saveMap: Ids;
  skillMap: Ids;
  /** Its aptitudes and its base ruleset's. */
  aptMap: Ids;
  /** Its feats and its base ruleset's, its own under a name they share. */
  featMap: Ids;
  /** Its own powers. */
  powerMap: Ids;
  /** Its base ruleset's powers, which it copies before adding them to a spell list (`cowPower`). */
  inheritedPowerMap: Ids;
};

/** Ids by name. */
export function idsByName(rows: { id: string; name: string }[]): Ids {
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}

/** Creates a published system ruleset, the core rules or an extension of `baseId`, and returns its id. */
export async function createSystemRuleset(db: Db, ruleset: { name: string; description: string }, baseId?: string) {
  const baseRules: BaseRules = "Dungeons & Dragons: 3.5";
  const [{ id }] = await db
    .insert(rulesetsInRules)
    .values({
      ...ruleset,
      status: "Published",
      baseRules,
      system: true,
      ...(baseId
        ? { kind: "extension" as const, rulesetId: baseId, ancestorRulesetIds: [baseId] }
        : { kind: "ruleset" as const }),
    })
    .returning({ id: rulesetsInRules.id });
  if (baseId) await db.insert(rulesetExtensionsInRules).values({ rulesetId: baseId, extensionId: id });
  return id;
}

/** The seeded core rules' id, which `user` (what needs them) can't do without. */
export async function coreRulesetId(db: Db, user: string): Promise<string> {
  const [core] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!core) throw new Error(`${user} needs ${DND35_RULESET_NAME}, which isn't seeded`);
  return core.id;
}

/** The context of a ruleset about to be seeded. */
export function newSeedContext(rulesetId: string): SeedContext {
  return {
    rulesetId,
    abilityMap: {},
    saveMap: {},
    skillMap: {},
    aptMap: {},
    featMap: {},
    powerMap: {},
    inheritedPowerMap: {},
  };
}

/** The context of a seeded ruleset: the ids of its unarchived rows. */
export async function loadSeedContext(db: Db, rulesetId: string): Promise<SeedContext> {
  // One after the other: a transaction runs one query at a time.
  const names = async (
    table:
      | typeof abilitiesInRules
      | typeof savesInRules
      | typeof skillsInRules
      | typeof aptitudesInRules
      | typeof featsInRules
      | typeof powersInRules,
  ) =>
    idsByName(
      await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(and(eq(table.rulesetId, rulesetId), isNull(table.deletedAt))),
    );
  return {
    rulesetId,
    abilityMap: await names(abilitiesInRules),
    saveMap: await names(savesInRules),
    skillMap: await names(skillsInRules),
    aptMap: await names(aptitudesInRules),
    featMap: await names(featsInRules),
    powerMap: await names(powersInRules),
    inheritedPowerMap: {},
  };
}

/**
 * The context of a new extension of the context's ruleset: it names the base's rows (in maps of its own, which leave
 * the base's as they are), and has no powers of its own yet, its base's (and those its base inherits) being the ones
 * it copies before changing them (`inheritedPowerMap`).
 */
export async function extensionContext(
  db: Db,
  base: SeedContext,
  ruleset: { name: string; description: string },
): Promise<SeedContext> {
  const { powerMap, inheritedPowerMap, ...names } = structuredClone(base);
  return {
    ...names,
    rulesetId: await createSystemRuleset(db, ruleset, base.rulesetId),
    powerMap: {},
    inheritedPowerMap: { ...inheritedPowerMap, ...powerMap },
  };
}

/** The id of a row the content names, or an error that says which. */
export function idOf(ids: Ids, name: string, what: string): string {
  const id = ids[name];
  if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
  return id;
}
