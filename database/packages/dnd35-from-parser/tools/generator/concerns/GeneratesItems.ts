import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import { buildItemSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/items.ts";
import type { ItemReference } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import { getArmorDefinition, getShieldDefinition } from "@/database/packages/dnd35/content/items/armor.ts";
import type { Constructor } from "@/server/mixins.ts";

type ItemSeeds = ReturnType<typeof buildItemSeeds>;

/** Generating a book's mundane items: its weapons, armor, shields and goods. */
export function GeneratesItems<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingItems extends Base {
    private getArmorProf(generatorName: string): string {
      return this.armorProficiencyOf(getArmorDefinition(generatorName)?.armorType);
    }

    private getShieldProf(generatorName: string): string {
      const def = getShieldDefinition(generatorName);
      if (def?.shieldType === "Tower") return "TOWER_SHIELD_PROF";
      return "SHIELD_PROF";
    }

    private writeArmorFile(path: string, constName: string, items: ItemSeeds["armor"]) {
      this.writeItemFile(
        path,
        constName,
        ["armorProperties", ...items.map((a) => this.getArmorProf(a.name))],
        items,
        (a) => [
          `weight: ${quote(a.weight)}, costGp: ${quote(a.costGp)}, type: "Armor", slot: "Torso",`,
          `requirements: ${this.getArmorProf(a.name)},`,
          `properties: armorProperties(${quote(a.name)}),`,
        ],
      );
    }

    private writeGoodsFile(path: string, constName: string, items: ItemSeeds["goods"]) {
      this.writeItemFile(path, constName, [], items, (g) => [
        `weight: ${quote(g.weight)}, costGp: ${quote(g.costGp)}, type: "Other", slot: "Other",`,
        `properties: [],`,
      ]);
    }

    private writeShieldFile(path: string, constName: string, items: ItemSeeds["shields"]) {
      this.writeItemFile(
        path,
        constName,
        ["shieldProperties", ...items.map((s) => this.getShieldProf(s.name))],
        items,
        (s) => [
          `weight: ${quote(s.weight)}, costGp: ${quote(s.costGp)}, type: "Shield", slot: "Off Hand",`,
          `requirements: ${this.getShieldProf(s.name)},`,
          `properties: shieldProperties(${quote(s.name)}),`,
        ],
      );
    }

    private writeWeaponFile(path: string, constName: string, weapons: ItemSeeds["simpleWeapons"], profFn: string) {
      this.writeItemFile(path, constName, [profFn, "weaponProperties"], weapons, (w) => [
        `weight: ${quote(w.weight)}, costGp: ${quote(w.costGp)}, type: "Weapon",`,
        `requirements: ${profFn}(${quote(w.name)}),`,
        `properties: weaponProperties(${quote(w.name)}),`,
      ]);
    }

    /** A book's mundane items' files, a file per kind, and their index. */
    writeItems(ref: ItemReference, book: string) {
      const seeds = buildItemSeeds(ref);
      const outDir = join(this.dir, book, "items");

      // weapons.ts
      this.writeWeaponFile(join(outDir, "weapons.ts"), "SIMPLE_WEAPONS", seeds.simpleWeapons, "simple");
      this.writeWeaponFile(join(outDir, "martial.ts"), "MARTIAL_WEAPONS", seeds.martialWeapons, "martial");
      this.writeWeaponFile(join(outDir, "exotic.ts"), "EXOTIC_WEAPONS", seeds.exoticWeapons, "exotic");

      // armor.ts
      this.writeArmorFile(join(outDir, "armor.ts"), "ARMOR", seeds.armor);

      // shields.ts
      this.writeShieldFile(join(outDir, "shields.ts"), "SHIELDS", seeds.shields);

      // goods.ts
      this.writeGoodsFile(join(outDir, "goods.ts"), "GOODS", seeds.goods);

      // index.ts
      this.writeItemIndex(outDir);

      this.log(
        `\nDone! Generated ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons`,
      );
      this.log(`  ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`);
    }
  }
  return GeneratingItems;
}
