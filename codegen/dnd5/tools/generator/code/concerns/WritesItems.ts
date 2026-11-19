import { isDeepStrictEqual } from "node:util";

import type { BaseCodeFile } from "@/codegen/dnd5/tools/generator/code/BaseCodeFile.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { armorFields, shieldFields, weaponFields } from "@/content/dnd5/builders/items/fields.ts";
import {
  HEAVY_ARMOR_TRAINING,
  LIGHT_ARMOR_TRAINING,
  martial,
  MEDIUM_ARMOR_TRAINING,
  SHIELD_TRAINING,
  simple,
} from "@/content/dnd5/builders/items/proficiencies.ts";
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
 * A builder an item's requirements are written with: what it gives an item of a name (`of`), and whether it's called
 * with the item's name (`simple("Club")`) or is the value itself (`SHIELD_TRAINING`).
 */
interface RequirementsBuilder {
  called: boolean;
  name: string;
  of: (item: string) => RequirementEntry[];
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

/** The builders an item's requirements are written with: a weapon's proficiency, an armor's or the Shield's training. */
const ITEM_REQUIREMENTS: RequirementsBuilder[] = [
  { name: "simple", of: simple, called: true },
  { name: "martial", of: martial, called: true },
  { name: "HEAVY_ARMOR_TRAINING", of: () => HEAVY_ARMOR_TRAINING, called: false },
  { name: "LIGHT_ARMOR_TRAINING", of: () => LIGHT_ARMOR_TRAINING, called: false },
  { name: "MEDIUM_ARMOR_TRAINING", of: () => MEDIUM_ARMOR_TRAINING, called: false },
  { name: "SHIELD_TRAINING", of: () => SHIELD_TRAINING, called: false },
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
     * An item's requirements as code (`requirements`): with the builder that gives them for the item's name (`item`),
     * else an array of them, one per line.
     */
    private itemRequirements(item: string, requirements: RequirementEntry[]): string {
      const builder = ITEM_REQUIREMENTS.find(({ of }) => isDeepStrictEqual(of(item), requirements));
      if (builder) {
        this.uses.add(builder.name);
        return builder.called ? `${builder.name}(${this.quote(item)})` : builder.name;
      }
      return `[\n${requirements.map((entry) => `      ${this.requirement(entry, 3)},`).join("\n")}\n    ]`;
    }

    /**
     * An item written as code, a list's item: its requirements (written with the builder that gives them for its name,
     * when one does: `simple("Club")`, a training), its fields as stored (written with the builder that gives them for
     * its name, when one does: `...weaponFields("Club")`), the template it's made from (its `madeFrom` link) by its
     * name, and its modifiers.
     */
    item(item: Dnd5ItemSeed): string[] {
      const { name, description, fields, links, requirements } = item;
      return [
        `  {`,
        `    name: ${this.quote(name)},`,
        `    description: ${this.quote(description)},`,
        ...(requirements?.length ? [`    requirements: ${this.itemRequirements(name, requirements)},`] : []),
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
