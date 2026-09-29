import { DND35_DMG_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed/extension.ts";
import type { ContentPackage } from "@/database/packages/types.ts";
import { BOOK } from "@/database/packages/dnd35-from-parser/generated/dmg/index.ts";

const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  seeds: [(db) => seedExtension(db, { name: DND35_DMG_NAME, description: "Dungeon Master's Guide — prestige classes for D&D 3.5." }, BOOK)],
};

export default dnd35Dmg;
