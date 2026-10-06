import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-arcane/index.ts";
import { CORE } from "@/database/packages/dnd35/data/core.ts";
import { DND35_COMPLETE_ARCANE_NAME } from "@/database/packages/dnd35/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
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
      await seeder.seedBook(BOOK, CORE.clericSpellLevels);
    },
  ],
};

export default dnd35CompleteArcane;
