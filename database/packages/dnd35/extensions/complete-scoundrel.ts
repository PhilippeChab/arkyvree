import { CORE } from "@/content/dnd3.5/data/core.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-scoundrel/index.ts";
import { DND35_COMPLETE_SCOUNDREL_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteScoundrel: ContentPackage = {
  name: "dnd35-complete-scoundrel",
  type: "extension",
  seedsVersion: 4,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_COMPLETE_SCOUNDREL_NAME,
        description: "Feats, prestige classes, and tricks for scoundrels in D&D 3.5.",
      });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};

export default dnd35CompleteScoundrel;
