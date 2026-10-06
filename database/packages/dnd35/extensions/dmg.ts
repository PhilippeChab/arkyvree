import { BOOK } from "@/database/packages/dnd35-from-parser/generated/dmg/index.ts";
import { DND35_DMG_NAME } from "@/database/packages/dnd35/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  seeds: [
    (db) =>
      RulesetSeeder.seedExtension(
        db,
        { name: DND35_DMG_NAME, description: "Dungeon Master's Guide — prestige classes for D&D 3.5." },
        BOOK,
      ),
  ],
};

export default dnd35Dmg;
