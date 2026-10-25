import { isDeepStrictEqual } from "node:util";

import type { BaseCodeFile } from "@/codegen/dnd3.5/tools/generator/code/BaseCodeFile.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { armorFields, shieldFields, weaponFields } from "@/content/dnd3.5/builders/items/fields.ts";
import {
  exotic,
  HEAVY_ARMOR_PROF,
  LIGHT_ARMOR_PROF,
  martial,
  MEDIUM_ARMOR_PROF,
  SHIELD_PROF,
  simple,
  TOWER_SHIELD_PROF,
} from "@/content/dnd3.5/builders/items/proficiencies.ts";
import type { Dnd35ItemSeed, ItemFields } from "@/content/dnd3.5/builders/items/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { ARMOR_TYPE_DEFINITIONS, SHIELD_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/armor.ts";
import { WEAPON_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/weapons.ts";

/**
 * A builder an item's seed's part (its requirements, its fields) is written with: what it gives an item of a name
 * (`of`, none when it gives it nothing), and whether it's called with the name (`simple("Club")`) or is the value
 * itself (`SHIELD_PROF`).
 */
interface ItemBuilder<V> {
  called: boolean;
  name: string;
  of: (item: string) => V | undefined;
}

/** The builders an item's fields are written with: its weapon's, armor's or shield's type's, when it's one. */
const ITEM_FIELDS: ItemBuilder<ItemFields>[] = [
  {
    name: "weaponFields",
    of: (item) => (WEAPON_TYPE_DEFINITIONS[item] ? weaponFields(item) : undefined),
    called: true,
  },
  {
    name: "armorFields",
    of: (item) => (ARMOR_TYPE_DEFINITIONS[item] ? armorFields(item) : undefined),
    called: true,
  },
  {
    name: "shieldFields",
    of: (item) => (SHIELD_TYPE_DEFINITIONS[item] ? shieldFields(item) : undefined),
    called: true,
  },
];

/**
 * The builders an item's requirements are written with: a function of its name (`simple("Club")`), or a proficiency
 * as it is (`SHIELD_PROF`).
 */
const ITEM_REQUIREMENTS: ItemBuilder<RequirementEntry[]>[] = [
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
     * An item's seed's part (`value`: its requirements, its fields) as code: the builder of `builders` that gives it for
     * the item's name (`item`), else as `write` writes it.
     */
    private itemPart<V>(item: string, value: V, builders: ItemBuilder<V>[], write: (value: V) => string): string {
      const builder = builders.find(({ of }) => isDeepStrictEqual(of(item), value));
      if (builder) {
        this.uses.add(builder.name);
        return builder.called ? `${builder.name}(${this.quote(item)})` : builder.name;
      }
      return write(value);
    }

    /** An item's requirements as code: an array of them, one per line. */
    private requirementList(entries: RequirementEntry[]): string {
      if (entries.length === 0) return "[]";
      return `[\n${entries.map((entry) => `      ${this.requirement(entry, 3)},`).join("\n")}\n    ]`;
    }

    /**
     * An item written as code, a list's item. Its requirements and its fields are written with the builder that gives
     * them for its name (`simple("Club")`, `weaponFields("Club")`, a proficiency), when one does.
     */
    item(item: Dnd35ItemSeed): string[] {
      const { name, description, weight, costGp, type, slot, isTemplate, requirements, sourceItem, fields } = item;
      return [
        `  {`,
        `    name: ${this.quote(name)},`,
        `    description: ${this.quote(description)},`,
        `    weight: ${this.quote(weight)}, costGp: ${this.quote(costGp)}, type: ${this.quote(type)},${slot ? ` slot: ${this.quote(slot)},` : ""}`,
        ...(isTemplate ? [`    isTemplate: true,`] : []),
        ...(requirements
          ? [
              `    requirements: ${this.itemPart(name, requirements, ITEM_REQUIREMENTS, (entries) => this.requirementList(entries))},`,
            ]
          : []),
        ...(sourceItem ? [`    sourceItem: ${this.quote(sourceItem)},`] : []),
        ...(fields
          ? [`    fields: ${this.itemPart(name, fields, ITEM_FIELDS, (values) => this.fieldValue(values))},`]
          : []),
        ...this.listField(
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
