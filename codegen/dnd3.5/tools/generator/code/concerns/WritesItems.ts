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
 * A builder an item's seed's part (its requirements, some of its fields) is written with: what it gives an item of a
 * name (`of`, none when it gives it nothing).
 */
interface ItemBuilder<V> {
  name: string;
  of: (item: string) => V | undefined;
}

/**
 * A builder an item's requirements are written with: whether it's called with the item's name (`simple("Club")`) or is
 * the value itself (`SHIELD_PROF`).
 */
interface RequirementsBuilder extends ItemBuilder<RequirementEntry[]> {
  called: boolean;
}

/**
 * The builders some of an item's fields are written with, after its own, each called with its name: its weapon's,
 * armor's or shield's type's, when it's one.
 */
const ITEM_FIELDS: ItemBuilder<ItemFields>[] = [
  {
    name: "weaponFields",
    of: (item) => (WEAPON_TYPE_DEFINITIONS[item] ? weaponFields(item) : undefined),
  },
  {
    name: "armorFields",
    of: (item) => (ARMOR_TYPE_DEFINITIONS[item] ? armorFields(item) : undefined),
  },
  {
    name: "shieldFields",
    of: (item) => (SHIELD_TYPE_DEFINITIONS[item] ? shieldFields(item) : undefined),
  },
];

/**
 * The builders an item's requirements are written with: a function of its name (`simple("Club")`), or a proficiency
 * as it is (`SHIELD_PROF`).
 */
const ITEM_REQUIREMENTS: RequirementsBuilder[] = [
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
     * An item's fields as code: its own, then those the builder of its type gives for its name, when one gives some of
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
      return this.seedFields(own, `${builder.name}(${this.quote(item)})`);
    }

    /**
     * An item's requirements as code (`requirements`): with the builder that gives them for the item's name (`item`),
     * else an array of them, one per line.
     */
    private itemRequirements(item: string, requirements: RequirementEntry[]): string {
      const builder = ITEM_REQUIREMENTS.find(({ of }) => isDeepStrictEqual(of(item), requirements));
      if (builder) {
        this.uses.add(builder.name);
        return builder.called ? `${builder.name}(${this.quote(item)})` : builder.name;
      }
      if (requirements.length === 0) return "[]";
      return `[\n${requirements.map((entry) => `      ${this.requirement(entry, 3)},`).join("\n")}\n    ]`;
    }

    /**
     * An item written as code, a list's item: its fields as stored, and the template it's made from (its `madeFrom`
     * link) by its name. Its requirements and its fields are written with the builder that gives them for its name
     * (`simple("Club")`, `...weaponFields("Club")`, a proficiency), when one does.
     */
    item(item: Dnd35ItemSeed): string[] {
      const { name, description, requirements, fields, links } = item;
      return [
        `  {`,
        `    name: ${this.quote(name)},`,
        `    description: ${this.quote(description)},`,
        ...(requirements ? [`    requirements: ${this.itemRequirements(name, requirements)},`] : []),
        `    fields: ${this.itemFields(name, fields)},`,
        ...(links?.madeFrom ? [`    links: { madeFrom: ${this.quote(links.madeFrom)} },`] : []),
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
