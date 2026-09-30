import { asc, eq, inArray } from "drizzle-orm";
import { createSystemRuleset, loadSeedContext, newSeedContext, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { modifiersInCustomization, propertiesInCustomization, requirementsInCustomization, rulesetsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { uniqueId } from "@/tests/helpers.ts";
import { describeRequirement } from "@/tests/seeds/seededRows.ts";

/** A new system ruleset for a test to seed into, and its context: empty, or naming the seeded core's rows (`named`). */
export async function freshSeedContext({ named = false } = {}): Promise<SeedContext> {
  const rulesetId = await createSystemRuleset(db, { name: `Seed test ${uniqueId()}`, description: "A ruleset a test seeds into" });
  if (!named) return newSeedContext(rulesetId);
  const [core] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules).where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  return { ...await loadSeedContext(db, core.id), rulesetId, powerMap: {}, inheritedPowerMap: {} };
}

/** A new extension of the context's ruleset, and its context: it names the base's rows, as `seedExtension`'s does. */
export async function freshExtensionContext(base: SeedContext): Promise<SeedContext> {
  const rulesetId = await createSystemRuleset(db, { name: `Seed test extension ${uniqueId()}`, description: "An extension a test seeds into" }, base.rulesetId);
  return { ...structuredClone(base), rulesetId, powerMap: {}, inheritedPowerMap: { ...base.powerMap } };
}

/** A modifier as a line: "target operator value valueType". */
const describeModifier = (m: { target: string; operator: string; value: string; valueType: string }) => `${m.target} ${m.operator} ${m.value} ${m.valueType}`;

/**
 * What an entity was seeded with, as its content reads: its requirements ("level target operator value"), its
 * modifiers (each with its requirements) and its properties ("type value"), each sorted.
 */
export async function customizationsOf(entityId: string) {
  const requirementsOf = async (id: string) =>
    (await db.select().from(requirementsInCustomization).where(eq(requirementsInCustomization.entityId, id)).orderBy(asc(requirementsInCustomization.level)))
      .map(describeRequirement);
  const modifiers = await db.select().from(modifiersInCustomization).where(eq(modifiersInCustomization.sourceId, entityId));
  const modifierLines: string[] = [];
  for (const modifier of modifiers) {
    const requirements = await requirementsOf(modifier.id);
    modifierLines.push([describeModifier(modifier), ...requirements.map((r) => `  if ${r}`)].join("\n"));
  }
  const properties = await db.select().from(propertiesInCustomization).where(eq(propertiesInCustomization.entityId, entityId));
  return {
    requirements: await requirementsOf(entityId),
    modifiers: modifierLines.sort(),
    properties: properties.map((p) => `${p.type} ${p.value}`).sort(),
  };
}

/** The modifiers of several entities (class levels, feats), each as `describeModifier` with its requirements. */
export async function modifiersOf(entityIds: string[]) {
  if (entityIds.length === 0) return [];
  const modifiers = await db.select().from(modifiersInCustomization).where(inArray(modifiersInCustomization.sourceId, entityIds));
  return modifiers.map((m) => ({ sourceId: m.sourceId, line: describeModifier(m), id: m.id }));
}
