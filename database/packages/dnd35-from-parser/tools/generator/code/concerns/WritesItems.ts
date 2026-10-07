import { isDeepStrictEqual } from "node:util";

import type { BaseCodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/BaseCodeFile.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { Property, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { getArmorDefinition, getShieldDefinition } from "@/database/packages/dnd35/content/items/armor.ts";
import {
  exotic,
  HEAVY_ARMOR_PROF,
  LIGHT_ARMOR_PROF,
  martial,
  MEDIUM_ARMOR_PROF,
  SHIELD_PROF,
  simple,
  TOWER_SHIELD_PROF,
} from "@/database/packages/dnd35/content/items/proficiencies.ts";
import {
  armorProperties,
  shieldProperties,
  weaponProperties,
} from "@/database/packages/dnd35/content/items/properties.ts";
import type { ItemSeed } from "@/database/packages/dnd35/content/items/types.ts";
import { getWeaponDefinition } from "@/database/packages/dnd35/content/items/weapons.ts";
import type { Constructor } from "@/server/mixins.ts";

/**
 * A builder an item's field is written with: what it gives an item of a name (`of`, none when it gives it nothing),
 * and whether it's called with the name (`simple("Club")`) or is the value itself (`SHIELD_PROF`).
 */
type ItemBuilder<V> = { called: boolean; name: string; of: (item: string) => V[] | undefined };

/** The builders an item's properties are written with: its weapon's, armor's or shield's type's, when it's one. */
const ITEM_PROPERTIES: ItemBuilder<Property>[] = [
  {
    name: "weaponProperties",
    of: (item) => (getWeaponDefinition(item) ? weaponProperties(item) : undefined),
    called: true,
  },
  {
    name: "armorProperties",
    of: (item) => (getArmorDefinition(item) ? armorProperties(item) : undefined),
    called: true,
  },
  {
    name: "shieldProperties",
    of: (item) => (getShieldDefinition(item) ? shieldProperties(item) : undefined),
    called: true,
  },
];

/**
 * The builders an item's requirements are written with: a function of its name (`simple("Club")`), or a proficiency
 * as it is (`SHIELD_PROF`).
 */
const ITEM_REQUIREMENTS: ItemBuilder<RequirementEntry>[] = [
  { name: "simple", of: simple, called: true },
  { name: "martial", of: martial, called: true },
  { name: "exotic", of: exotic, called: true },
  { name: "HEAVY_ARMOR_PROF", of: () => HEAVY_ARMOR_PROF, called: false },
  { name: "LIGHT_ARMOR_PROF", of: () => LIGHT_ARMOR_PROF, called: false },
  { name: "MEDIUM_ARMOR_PROF", of: () => MEDIUM_ARMOR_PROF, called: false },
  { name: "SHIELD_PROF", of: () => SHIELD_PROF, called: false },
  { name: "TOWER_SHIELD_PROF", of: () => TOWER_SHIELD_PROF, called: false },
];

/** Writing an item. */
export function WritesItems<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingItems extends Base {
    /**
     * An item's field (`values`) as code: the builder of `builders` that gives it for the item's name (`item`), else
     * each of its values (`write`), one per line.
     */
    private itemField<V>(item: string, values: V[], builders: ItemBuilder<V>[], write: (value: V) => string): string {
      const builder = builders.find(({ of }) => isDeepStrictEqual(of(item), values));
      if (builder) {
        this.uses.add(builder.name);
        return builder.called ? `${builder.name}(${quote(item)})` : builder.name;
      }
      return values.length === 0 ? "[]" : `[\n${values.map((value) => `      ${write(value)},`).join("\n")}\n    ]`;
    }

    /**
     * An item written as code, a list's item. Its requirements and its properties are written with the builder that
     * gives them for its name (`simple("Club")`, `weaponProperties("Club")`, a proficiency), when one does.
     */
    item(item: ItemSeed): string[] {
      const { name, description, weight, costGp, type, slot, isTemplate, requirements, sourceItem, properties } = item;
      return [
        `  {`,
        `    name: ${quote(name)},`,
        `    description: ${quote(description)},`,
        `    weight: ${quote(weight)}, costGp: ${quote(costGp)}, type: ${quote(type)},${slot ? ` slot: ${quote(slot)},` : ""}`,
        ...(isTemplate ? [`    isTemplate: true,`] : []),
        ...(requirements
          ? [
              `    requirements: ${this.itemField(name, requirements, ITEM_REQUIREMENTS, (r) => this.requirement(r, 3))},`,
            ]
          : []),
        ...(sourceItem ? [`    sourceItem: ${quote(sourceItem)},`] : []),
        `    properties: ${this.itemField(name, properties, ITEM_PROPERTIES, (p) => this.property(p))},`,
        ...listField(
          "modifiers",
          (item.modifiers ?? []).map((m) => this.plainModifier(m)),
          "    ",
        ),
        `  },`,
      ];
    }
  }
  return WritingItems;
}
