import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { Ids, SeederState } from "@/database/seeders/core/SeederState.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding items. */
export function SeedsItems<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingItems extends Base {
    /**
     * Refuses an item made from another its ruleset's rules refuse it to be made from, as its form's save does (3.5's:
     * a template of another type, or of a type no template is of), the other being a template.
     */
    protected abstract checkMadeFrom(item: ItemSeed, template: ItemSeed): void;

    /**
     * An item's single links (`links`, by role, each an item's name: the template it's made from) as their write, each
     * the id of the item it names among those seeded with it (`items`, `ids`), as an item's form's save takes it: an
     * item it doesn't seed, one that isn't a template (its kind's template flag, `type`'s), a template's naming any, or
     * one its ruleset's rules refuse (`checkMadeFrom`) refuses the seed.
     */
    private itemLinks(type: string, item: ItemSeed, items: ReadonlyMap<string, ItemSeed>, ids: Ids) {
      const flag = Engine.storage().kind(type).template;
      const links = Object.entries(item.links ?? {}) as [string, string][];
      if (flag && item.fields[flag] === true && links.length > 0)
        throw new Error(`${item.name}: a template item can't be made from another (its ${links[0][0]})`);
      return Object.fromEntries(
        links.map(([role, name]) => {
          const id = this.idOf(ids, name, `${item.name}'s ${role}`);
          const template = items.get(name)!;
          if (flag && template.fields[flag] !== true)
            throw new Error(`${item.name}'s ${role}: "${name}" isn't a template`);
          this.checkMadeFrom(item, template);
          return [role, id];
        }),
      );
    }

    /**
     * Seeds items of a kind a character's inventory holds (`type`, its ruleset seeder's: one its module's storage
     * declares an item type) with their fields as stored, their single links (each naming a template seeded with them:
     * the one it's made from, `itemLinks`) and their requirements and modifiers. Each item's id is drawn before any is
     * written, so a link names one wherever it stands among them. Returns their ids by name.
     */
    async seedItems(type: string, items: ItemSeed[]) {
      if (items.length === 0) return {};
      const ids: Ids = Object.fromEntries(items.map((item) => [item.name, crypto.randomUUID()]));
      const byName = new Map(items.map((item) => [item.name, item]));
      await this.insertEntities(
        type,
        items.map((item) => ({
          id: ids[item.name],
          rulesetId: this.ctx.rulesetId,
          name: item.name,
          description: item.description,
          fields: item.fields,
          links: this.itemLinks(type, item, byName, ids),
        })),
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
