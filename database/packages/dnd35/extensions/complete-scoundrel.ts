import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/index.ts";
import { DND35_COMPLETE_SCOUNDREL_NAME } from "@/database/packages/dnd35/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteScoundrel: ContentPackage = {
  name: "dnd35-complete-scoundrel",
  type: "extension",
  seedsVersion: 4,
  seeds: [
    (db) =>
      RulesetSeeder.seedExtension(
        db,
        {
          name: DND35_COMPLETE_SCOUNDREL_NAME,
          description: "Feats, prestige classes, and tricks for scoundrels in D&D 3.5.",
        },
        BOOK,
      ),
  ],
};

export default dnd35CompleteScoundrel;
