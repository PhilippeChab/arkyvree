import { eq } from "drizzle-orm";
import {
  itemsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { buildRequirements } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";
import {
  SIMPLE_WEAPONS, MARTIAL_WEAPONS, EXOTIC_WEAPONS, ARMOR, SHIELDS, GOODS,
  MAGIC_ARMOR, MAGIC_SHIELDS, MAGIC_WEAPONS, WONDROUS_ITEMS, RINGS, RODS, STAFFS,
} from "@/database/packages/dnd35/v1/items/data.ts";

export async function seedItems(db: Db, rulesetId: string, items: ItemDef[], options?: { isTemplate?: boolean; templateMap?: Record<string, string> }): Promise<Record<string, string>> {
  const isTemplate = options?.isTemplate ?? false;
  const templateMap = options?.templateMap;
  const nameToId: Record<string, string> = {};
  for (const item of items) {
    const sourceItemId = item.sourceItem && templateMap ? templateMap[item.sourceItem] : undefined;
    const [inserted] = await db
      .insert(itemsInRules)
      .values({
        rulesetId,
        name: item.name,
        description: item.description,
        weight: item.weight,
        costGp: item.costGp,
        type: item.type,
        isTemplate,
        ...(item.slot && { slot: item.slot }),
        ...(sourceItemId && { sourceItemId }),
      })
      .returning({ id: itemsInRules.id });

    if (item.properties.length > 0) {
      await db.insert(propertiesInCustomization).values(
        item.properties.map((p) => ({
          entityId: inserted.id,
          entityType: "items" as const,
          type: p.type,
          value: p.value,
        })),
      );
    }

    if (item.requirements && item.requirements.length > 0) {
      await db.insert(requirementsInCustomization).values(
        buildRequirements(inserted.id, "items", item.requirements),
      );
    }

    if (item.modifiers && item.modifiers.length > 0) {
      await db.insert(modifiersInCustomization).values(
        item.modifiers.map((m) => ({
          sourceId: inserted.id,
          sourceType: "items" as const,
          target: m.target,
          operator: m.operator,
          value: m.value,
          valueType: m.valueType,
        })),
      );
    }

    nameToId[item.name] = inserted.id;
  }
  return nameToId;
}

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const templateMap = await seedItems(db, ruleset.id, [
    ...SIMPLE_WEAPONS,
    ...MARTIAL_WEAPONS,
    ...EXOTIC_WEAPONS,
    ...ARMOR,
    ...SHIELDS,
  ], { isTemplate: true });

  await seedItems(db, ruleset.id, [
    ...GOODS,
    ...MAGIC_ARMOR,
    ...MAGIC_SHIELDS,
    ...MAGIC_WEAPONS,
    ...WONDROUS_ITEMS,
    ...RINGS,
    ...RODS,
    ...STAFFS,
  ], { templateMap });
}
