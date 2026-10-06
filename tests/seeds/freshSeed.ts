import { asc, eq } from "drizzle-orm";

import {
  coreRulesetId,
  createSystemRuleset,
  extensionContext,
  loadSeedContext,
  newSeedContext,
  type SeedContext,
} from "@/database/packages/dnd35/seed/context.ts";
import { modifiersInCustomization, propertiesInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { uniqueId } from "@/tests/helpers.ts";
import { describeRequirement } from "@/tests/seeds/seededRows.ts";

/** A modifier as a line: "target operator value valueType". */
function describeModifier(m: { target: string; operator: string; value: string; valueType: string }) {
  return `${m.target} ${m.operator} ${m.value} ${m.valueType}`;
}

/** A new system ruleset for a test to seed into, and its context: empty, or naming the seeded core's rows (`named`). */
export async function freshSeedContext({ named = false } = {}): Promise<SeedContext> {
  const rulesetId = await createSystemRuleset(db, {
    name: `Seed test ${uniqueId()}`,
    description: "A ruleset a test seeds into",
  });
  if (!named) return newSeedContext(rulesetId);
  return {
    ...(await loadSeedContext(db, await coreRulesetId(db, "A seed test naming its rows"))),
    rulesetId,
    powerMap: {},
    inheritedPowerMap: {},
  };
}

/** A new extension of the context's ruleset, and its context (`seedExtension`'s). */
export function freshExtensionContext(base: SeedContext) {
  return extensionContext(db, base, {
    name: `Seed test extension ${uniqueId()}`,
    description: "An extension a test seeds into",
  });
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
