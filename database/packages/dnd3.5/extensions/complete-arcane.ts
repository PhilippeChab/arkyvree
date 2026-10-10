import { CORE } from "@/content/dnd3.5/data/core.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-arcane/index.ts";
import { DND35_COMPLETE_ARCANE_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd3.5/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteArcane: ContentPackage = {
  name: "dnd35-complete-arcane",
  type: "extension",
  seedsVersion: 1,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_COMPLETE_ARCANE_NAME,
        description: "Arcane spellcasting options, prestige classes, and feats for D&D 3.5.",
      });
      await seeder.seedBook(BOOK, CORE.classes);
    },
  ],
};

export default dnd35CompleteArcane;
