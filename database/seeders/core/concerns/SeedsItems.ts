import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { SeederState } from "@/database/seeders/core/SeederState.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { EntityWrite, FieldsWrite } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding items. */
export function SeedsItems<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingItems extends Base {
    /**
     * An item's seeded fields (those its ruleset declares an item's) as their write, by stored field: its module's
     * content's codec's (`Engine.forRules(baseRules).toFieldsWrite`).
     */
    protected abstract itemFieldsWrite(fields: object): FieldsWrite;

    /**
     * What an item's seed writes of it (`item`): its cost, weight, type and slot, whether it's a template, and its link
     * to its template (`templateId`), as its module stores them.
     */
    protected abstract itemWrite(
      item: ItemSeed<object>,
      made: { isTemplate: boolean; templateId?: string },
    ): EntityWrite;

    /**
     * Seeds items of a kind a character's inventory holds (`type`, its ruleset seeder's: one its module's storage
     * declares an item type) with their fields, requirements and modifiers, as templates or made from the templates
     * `templateMap` has by name. Returns their ids by name.
     */
    async seedItems(
      type: string,
      items: ItemSeed<object>[],
      options: { isTemplate?: boolean; templateMap?: Record<string, string> } = {},
    ) {
      if (items.length === 0) return {};
      const ids = await this.insertEntities(
        type,
        items.map((item) => {
          const write = this.itemWrite(item, {
            isTemplate: options.isTemplate ?? false,
            templateId: item.sourceItem ? options.templateMap?.[item.sourceItem] : undefined,
          });
          const fields = this.itemFieldsWrite(item.fields ?? {});
          return {
            rulesetId: this.ctx.rulesetId,
            name: item.name,
            description: item.description,
            fields: { ...write.fields, ...fields.fields },
            links: { ...write.links, ...fields.links },
          };
        }),
      );
      await this.insertAll(
        requirementsInCustomization,
        items.flatMap((item) => this.requirementRows(ids[item.name], type, item.requirements)),
      );
      await this.insertAll(
        modifiersInCustomization,
        items.flatMap((item) => this.modifierRows(ids[item.name], type, item.modifiers)),
      );
      return ids;
    }
  }
  return SeedingItems;
}
