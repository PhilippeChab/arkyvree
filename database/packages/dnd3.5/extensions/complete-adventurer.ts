import { CORE } from "@/content/dnd3.5/data/core.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-adventurer/index.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd3.5/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteAdventurer: ContentPackage = {
  name: "dnd35-complete-adventurer",
  type: "extension",
  seedsVersion: 6,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_COMPLETE_ADVENTURER_NAME,
        description: "Rogue, scout, and skill-focused options for D&D 3.5.",
      });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};

export default dnd35CompleteAdventurer;
