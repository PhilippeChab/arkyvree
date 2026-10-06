import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteWarrior: ContentPackage = {
  name: "dnd35-complete-warrior",
  type: "extension",
  seedsVersion: 22,
  seeds: [
    (db) =>
      RulesetSeeder.seedExtension(
        db,
        { name: DND35_COMPLETE_WARRIOR_NAME, description: "Martial feats and combat options for D&D 3.5." },
        BOOK,
      ),
  ],
};

export default dnd35CompleteWarrior;
