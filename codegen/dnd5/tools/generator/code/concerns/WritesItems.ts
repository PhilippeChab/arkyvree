import { isDeepStrictEqual } from "node:util";

import type { BaseCodeFile } from "@/codegen/dnd5/tools/generator/code/BaseCodeFile.ts";
import { armorFields, shieldFields, weaponFields } from "@/content/dnd5/builders/items/fields.ts";
import type { Dnd5ItemSeed, ItemFields } from "@/content/dnd5/builders/items/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { ARMOR_DEFINITIONS } from "@/vocabulary/dnd5/armor.ts";
import { WEAPON_DEFINITIONS } from "@/vocabulary/dnd5/weapons.ts";

/**
 * A builder some of an item's fields are written with: what it gives an item of a name (`of`, none when it gives it
 * nothing), and its call for that name (`call`: `weaponFields("Club")`, `shieldFields()`).
 */
interface FieldsBuilder {
  call: (item: string) => string;
  name: string;
  of: (item: string) => ItemFields | undefined;
}

/**
 * The builders some of an item's fields are written with, after its own: its weapon's, armor's or the Shield's, off
 * the vocabulary's tables, when it's one.
 */
const ITEM_FIELDS: FieldsBuilder[] = [
  {
    name: "weaponFields",
    of: (item) => (WEAPON_DEFINITIONS[item] ? weaponFields(item) : undefined),
    call: (item) => `weaponFields(${JSON.stringify(item)})`,
  },
  {
    name: "armorFields",
    of: (item) => (ARMOR_DEFINITIONS[item] ? armorFields(item) : undefined),
    call: (item) => `armorFields(${JSON.stringify(item)})`,
  },
  {
    name: "shieldFields",
    of: (item) => (item === "Shield" ? shieldFields() : undefined),
    call: () => "shieldFields()",
  },
];

/** Writing an item. */
export function WritesItems<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingItems extends Base {
    /**
     * An item's fields as code: its own, then those the builder of its kind gives for its name, when one gives some of
     * them as they are (`...weaponFields("Club")`).
     */
    private itemFields(item: string, fields: ItemFields): string {
      const builder = ITEM_FIELDS.find(({ of }) => {
        const given = of(item);
        return (
          given !== undefined &&
          Object.entries(given).every(([field, value]) => isDeepStrictEqual(fields[field as keyof ItemFields], value))
        );
      });
      if (!builder) return this.seedFields(fields);
      this.uses.add(builder.name);
      const given = builder.of(item)!;
      const own = Object.fromEntries(Object.entries(fields).filter(([field]) => !(field in given)));
      return this.seedFields(own, builder.call(item));
    }

    /**
     * An item written as code, a list's item: its fields as stored (written with the builder that gives them for its
     * name, when one does: `...weaponFields("Club")`), the template it's made from (its `madeFrom` link) by its name,
     * and its modifiers.
     */
    item(item: Dnd5ItemSeed): string[] {
      const { name, description, fields, links } = item;
      return [
        `  {`,
        `    name: ${this.quote(name)},`,
        `    description: ${this.quote(description)},`,
        `    fields: ${this.itemFields(name, fields)},`,
        ...(links?.madeFrom ? [`    links: { madeFrom: ${this.quote(links.madeFrom)} },`] : []),
        ...this.listField(
          "modifiers",
          (item.modifiers ?? []).map((modifier) => this.plainModifier(modifier)),
          "    ",
        ),
        `  },`,
      ];
    }
  }
  return WritingItems;
}
