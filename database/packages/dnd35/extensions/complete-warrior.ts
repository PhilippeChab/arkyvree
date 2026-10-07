import { CORE } from "@/content/dnd3.5/data/core.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-warrior/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteWarrior: ContentPackage = {
  name: "dnd35-complete-warrior",
  type: "extension",
  seedsVersion: 22,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_COMPLETE_WARRIOR_NAME,
        description: "Martial feats and combat options for D&D 3.5.",
      });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};

export default dnd35CompleteWarrior;
