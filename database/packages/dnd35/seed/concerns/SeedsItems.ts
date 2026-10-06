import type { ItemDef } from "@/database/packages/dnd35/content/types.ts";
import { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import {
  itemsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Seeding items. */
export function SeedsItems<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingItems extends Base {
    /**
     * Seeds items with their properties, requirements and modifiers, as templates or made from the templates
     * `templateMap` has by name. Returns their ids by name.
     */
    async seedItems(items: ItemDef[], options: { isTemplate?: boolean; templateMap?: Record<string, string> } = {}) {
      if (items.length === 0) return {};
      const ids = BaseSeeder.idsByName(
        await this.db
          .insert(itemsInRules)
          .values(
            items.map((item) => ({
              rulesetId: this.ctx.rulesetId,
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

      await this.insertAll(
        propertiesInCustomization,
        items.flatMap((item) => this.propertyRows(ids[item.name], "items", item.properties)),
      );
      await this.insertAll(
        requirementsInCustomization,
        items.flatMap((item) => this.requirementRows(ids[item.name], "items", item.requirements)),
      );
      await this.insertAll(
        modifiersInCustomization,
        items.flatMap((item) => this.modifierRows(ids[item.name], "items", item.modifiers)),
      );
      return ids;
    }
  }
  return SeedingItems;
}
