import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { SeederState } from "@/database/seeders/core/SeederState.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { FieldsWrite } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding items. */
export function SeedsItems<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingItems extends Base {
    /**
     * An item's seeded fields (those its ruleset declares an item's) as the write of its stored values: its module's
     * content's codec's (`Engine.forRules(baseRules).toFieldsWrite`).
     */
    protected abstract itemFieldsWrite(fields: object): FieldsWrite;

    /**
     * Seeds items with their fields, requirements and modifiers, as templates or made from the templates `templateMap`
     * has by name. Returns their ids by name.
     */
    async seedItems(
      items: ItemSeed<object>[],
      options: { isTemplate?: boolean; templateMap?: Record<string, string> } = {},
    ) {
      if (items.length === 0) return {};
      const ids = await this.insertEntities(
        "items",
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
      );

      await this.writeFields(
        items.map((item) => ({ id: ids[item.name], type: "items", values: this.itemFieldsWrite(item.fields ?? {}) })),
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
