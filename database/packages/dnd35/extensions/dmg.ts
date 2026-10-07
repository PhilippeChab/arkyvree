import { CORE } from "@/content/dnd3.5/data/core.ts";
import { BOOK } from "@/content/dnd3.5/generated/dmg/index.ts";
import { DND35_DMG_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_DMG_NAME,
        description: "Dungeon Master's Guide — prestige classes for D&D 3.5.",
      });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};

export default dnd35Dmg;
