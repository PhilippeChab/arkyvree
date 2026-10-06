import { existsSync } from "node:fs";
import { join } from "node:path";

import { buildItemSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/items.ts";
import { buildMagicItemSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/magicItems.ts";
import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import {
  stringifyModifier,
  stringifyProperty,
} from "@/database/packages/dnd35-from-parser/tools/generator/code/customization.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";
import type { MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types/magicItems.ts";
import type { Constructor } from "@/server/mixins.ts";
import { ARMOR_PROFICIENCY } from "@/shared/dnd3.5/properties/index.ts";

type MagicItemSeeds = ReturnType<typeof buildMagicItemSeeds>[keyof ReturnType<typeof buildMagicItemSeeds>];

/** Generating a book's magic items: its magic armor, shields and weapons, wondrous items, rings, rods and staffs. */
export function GeneratesMagicItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingMagicItems extends Base {
    /** The weight of each weapon, armor and shield the book's item reference seeds, by name: what an item made from one weighs. */
    private baseItemWeights(referenceDir: string): Record<string, string> {
      const path = join(referenceDir, "items.json");
      if (!existsSync(path)) return {};
      const seeds = buildItemSeeds(ReferenceLoader.load(path, "item"));
      const bases = [
        ...seeds.simpleWeapons,
        ...seeds.martialWeapons,
        ...seeds.exoticWeapons,
        ...seeds.armor,
        ...seeds.shields,
      ];
      return Object.fromEntries(bases.map((item) => [item.name, item.weight]));
    }

    private writeMagicItemFile(path: string, constName: string, items: MagicItemSeeds) {
      // A template's requirements are the proficiency with it, by its category
      const proficiency = (item: (typeof items)[number]) =>
        this.armorProficiencyOf(item.properties.find((property) => property.type === ARMOR_PROFICIENCY)?.value);
      const uses = items.filter((item) => item.isTemplate).map(proficiency);
      this.writeItemFile(path, constName, uses, items, (item) => [
        `weight: ${quote(item.weight)}, costGp: ${quote(item.costGp)}, type: ${quote(item.type)},${item.slot ? ` slot: ${quote(item.slot)},` : ""}`,
        ...(item.isTemplate ? [`isTemplate: true,`, `requirements: ${proficiency(item)},`] : []),
        ...(item.sourceItem ? [`sourceItem: ${quote(item.sourceItem)},`] : []),
        ...(item.properties.length > 0
          ? [`properties: [`, ...item.properties.map((p) => `  ${stringifyProperty(p)},`), `],`]
          : [`properties: [],`]),
        ...listField("modifiers", (item.modifiers ?? []).map(stringifyModifier), ""),
      ]);
    }

    /** A book's magic items' files, a file per kind, and the items' index with them. */
    writeMagicItems(ref: MagicItemReference, book: string, referenceDir: string) {
      const seeds = buildMagicItemSeeds(ref, this.baseItemWeights(referenceDir));
      const outDir = join(this.dir, book, "items");

      const files: [string, string, MagicItemSeeds][] = [
        ["magic-armor.ts", "MAGIC_ARMOR", seeds.magicArmor],
        ["magic-shields.ts", "MAGIC_SHIELDS", seeds.magicShields],
        ["magic-weapons.ts", "MAGIC_WEAPONS", seeds.magicWeapons],
        ["wondrous-items.ts", "WONDROUS_ITEMS", seeds.wondrousItems],
        ["rings.ts", "RINGS", seeds.rings],
        ["rods.ts", "RODS", seeds.rods],
        ["staffs.ts", "STAFFS", seeds.staffs],
      ];

      for (const [filename, constName, items] of files) {
        this.writeMagicItemFile(join(outDir, filename), constName, items);
      }

      this.writeItemIndex(outDir);

      this.log(
        `\nDone! Generated ${seeds.magicArmor.length} magic armor, ${seeds.magicShields.length} magic shields, ${seeds.magicWeapons.length} magic weapons`,
      );
      this.log(
        `  ${seeds.wondrousItems.length} wondrous items, ${seeds.rings.length} rings, ${seeds.rods.length} rods, ${seeds.staffs.length} staffs`,
      );
    }
  }
  return GeneratingMagicItems;
}
