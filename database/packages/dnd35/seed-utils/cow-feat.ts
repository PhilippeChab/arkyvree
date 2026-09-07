import { and, eq } from "drizzle-orm";
import {
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * COW a base feat into an extension ruleset for seeding purposes.
 *
 * Copies the feat entity + all customizations (requirements, modifiers,
 * modifier requirements, properties, feats_aptitudes) and creates an
 * entity_snapshots record so the runtime COW system recognises the copy.
 *
 * @returns The new (COW'd) feat ID, or null if the base feat wasn't found.
 */
export async function cowFeatIntoExtension(
  db: Db,
  baseFeatId: string,
  extensionRulesetId: string,
): Promise<string | null> {
  // 1. Fetch the base feat
  const [baseFeat] = await db
    .select()
    .from(featsInRules)
    .where(eq(featsInRules.id, baseFeatId));

  if (!baseFeat) return null;

  // 2. Copy feat entity into extension
  const [newFeat] = await db
    .insert(featsInRules)
    .values({
      rulesetId: extensionRulesetId,
      name: baseFeat.name,
      description: baseFeat.description,
      stackable: baseFeat.stackable,
      selectable: baseFeat.selectable,
    })
    .returning({ id: featsInRules.id });

  // 3. Copy requirements (remap entityId)
  const baseRequirements = await db
    .select()
    .from(requirementsInCustomization)
    .where(eq(requirementsInCustomization.entityId, baseFeatId));

  if (baseRequirements.length > 0) {
    await db.insert(requirementsInCustomization).values(
      baseRequirements.map((r) => ({
        entityId: newFeat.id,
        entityType: r.entityType,
        level: r.level,
        target: r.target,
        operator: r.operator,
        value: r.value,
        valueType: r.valueType,
        chainingOperator: r.chainingOperator,
      })),
    );
  }

  // 4. Copy feats_aptitudes (remap featId)
  const baseAptitudes = await db
    .select()
    .from(featsAptitudesInRules)
    .where(eq(featsAptitudesInRules.featId, baseFeatId));

  if (baseAptitudes.length > 0) {
    await db.insert(featsAptitudesInRules).values(
      baseAptitudes.map((fa) => ({
        featId: newFeat.id,
        aptitudeId: fa.aptitudeId,
      })),
    );
  }

  // 5. Copy modifiers (remap sourceId, then copy modifier requirements)
  const baseModifiers = await db
    .select()
    .from(modifiersInCustomization)
    .where(and(
      eq(modifiersInCustomization.sourceId, baseFeatId),
      eq(modifiersInCustomization.sourceType, "feats"),
    ));

  if (baseModifiers.length > 0) {
    const newModifiers = await db
      .insert(modifiersInCustomization)
      .values(
        baseModifiers.map((m) => ({
          sourceId: newFeat.id,
          sourceType: m.sourceType,
          target: m.target,
          value: m.value,
          valueType: m.valueType,
          operator: m.operator,
        })),
      )
      .returning({ id: modifiersInCustomization.id });

    // Copy modifier requirements (remap entityId from old modifier → new modifier)
    for (let i = 0; i < baseModifiers.length; i++) {
      const modReqs = await db
        .select()
        .from(requirementsInCustomization)
        .where(eq(requirementsInCustomization.entityId, baseModifiers[i].id));

      if (modReqs.length > 0) {
        await db.insert(requirementsInCustomization).values(
          modReqs.map((r) => ({
            entityId: newModifiers[i].id,
            entityType: r.entityType,
            level: r.level,
            target: r.target,
            operator: r.operator,
            value: r.value,
            valueType: r.valueType,
            chainingOperator: r.chainingOperator,
          })),
        );
      }
    }
  }

  // 6. Copy properties (remap entityId)
  const baseProperties = await db
    .select()
    .from(propertiesInCustomization)
    .where(eq(propertiesInCustomization.entityId, baseFeatId));

  if (baseProperties.length > 0) {
    await db.insert(propertiesInCustomization).values(
      baseProperties.map((p) => ({
        entityId: newFeat.id,
        entityType: p.entityType,
        value: p.value,
        type: p.type,
        description: p.description,
      })),
    );
  }

  // 7. Create entity_snapshots record
  await db.insert(entitySnapshotsInRules).values({
    rulesetId: extensionRulesetId,
    entityType: "feats",
    sourceEntityId: baseFeatId,
    forkedEntityId: newFeat.id,
    contentHash: "seed",
  });

  return newFeat.id;
}
