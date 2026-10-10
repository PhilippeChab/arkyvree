import { asc, eq } from "drizzle-orm";

import { DND35_BASE_RULES } from "@/content/dnd3.5/baseRules.ts";
import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import type { SeedContext } from "@/database/seeders/core/ContentSeeder.ts";
import { RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import { modifiersInCustomization, propertiesInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { uniqueId } from "@/tests/support/seed.ts";

import { describeRequirement } from "./seededRows.ts";

/** A modifier as a line: "target operator value valueType". */
function describeModifier(m: { operator: string; target: string; value: string; valueType: string }) {
  return `${m.target} ${m.operator} ${m.value} ${m.valueType}`;
}

/** A seeder of a new extension of the context's ruleset, as an extension's package makes one. */
export function freshExtensionSeeder(base: SeedContext) {
  return RulesetSeeder.createExtension(
    db,
    DND35_BASE_RULES,
    { name: `Seed test extension ${uniqueId()}`, description: "An extension a test seeds into" },
    base,
  );
}

/** The names of a context's ids, by id. */
export function namesOf(ids: Record<string, string>) {
  return Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
}

/**
 * What an entity was seeded with, as its content reads: its requirements ("level target operator value") by level,
 * and its modifiers (each with its requirements) and properties ("type value"), sorted.
 */
export async function describeCustomizations(entityId: string) {
  const requirementsOf = async (id: string) =>
    (
      await db
        .select()
        .from(requirementsInCustomization)
        .where(eq(requirementsInCustomization.entityId, id))
        .orderBy(asc(requirementsInCustomization.level))
    ).map(describeRequirement);
  const modifiers = await db
    .select()
    .from(modifiersInCustomization)
    .where(eq(modifiersInCustomization.sourceId, entityId));
  const modifierLines: string[] = [];
  for (const modifier of modifiers) {
    const requirements = await requirementsOf(modifier.id);
    modifierLines.push([describeModifier(modifier), ...requirements.map((r) => `  if ${r}`)].join("\n"));
  }
  const properties = await db
    .select()
    .from(propertiesInCustomization)
    .where(eq(propertiesInCustomization.entityId, entityId));
  return {
    requirements: await requirementsOf(entityId),
    modifiers: modifierLines.sort(),
    properties: properties.map((p) => `${p.type} ${p.value}`).sort(),
  };
}

/** A seeder of a new system ruleset for a test to seed into: naming no rows, or the seeded core's (`named`). */
export async function freshSeeder({ named = false } = {}) {
  const seeder = await RulesetSeeder.createCore(db, DND35_BASE_RULES, {
    name: `Seed test ${uniqueId()}`,
    description: "A ruleset a test seeds into",
  });
  if (!named) return seeder;
  return new RulesetSeeder(db, {
    ...(await RulesetSeeder.loadContext(
      db,
      await RulesetSeeder.findCoreRulesetId(db, DND35_CORE_PACKAGE, "A seed test naming its rows"),
    )),
    rulesetId: seeder.ctx.rulesetId,
    powerMap: {},
    inheritedPowerMap: {},
  });
}
