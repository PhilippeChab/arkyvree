import {
  ARMOR,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SHIELDS,
  SIMPLE_WEAPONS,
} from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import type { ItemDef } from "@/database/packages/dnd35/content/types.ts";
import { idsByName } from "@/database/packages/dnd35/seed/context.ts";
import {
  insertAll,
  modifierRows,
  propertyRows,
  requirementRows,
} from "@/database/packages/dnd35/seed/customization.ts";
import {
  itemsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

/** The items others are made from: every weapon, armor and shield. A new ruleset starts with them. */
export const TEMPLATE_ITEMS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS, ...ARMOR, ...SHIELDS];

/**
 * Seeds items with their properties, requirements and modifiers, as templates or made from the templates
 * `templateMap` has by name. Returns their ids by name.
 */
export async function seedItems(
  db: Db,
  rulesetId: string,
  items: ItemDef[],
  options: { isTemplate?: boolean; templateMap?: Record<string, string> } = {},
) {
  if (items.length === 0) return {};
  const ids = idsByName(
    await db
      .insert(itemsInRules)
      .values(
        items.map((item) => ({
          rulesetId,
          name: item.name,
          description: item.description,
          weight: item.weight,
          costGp: item.costGp,
          type: item.type,
          isTemplate: options.isTemplate ?? false,
          slot: item.slot || undefined,
          sourceItemId: item.sourceItem ? options.templateMap?.[item.sourceItem] : undefined,
        })),
      )
      .returning({ id: itemsInRules.id, name: itemsInRules.name }),
  );

  await insertAll(
    db,
    propertiesInCustomization,
    items.flatMap((item) => propertyRows(ids[item.name], "items", item.properties)),
  );
  await insertAll(
    db,
    requirementsInCustomization,
    items.flatMap((item) => requirementRows(ids[item.name], "items", item.requirements)),
  );
  await insertAll(
    db,
    modifiersInCustomization,
    items.flatMap((item) => modifierRows(ids[item.name], "items", item.modifiers)),
  );
  return ids;
}
