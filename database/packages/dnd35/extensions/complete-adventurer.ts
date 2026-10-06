import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/index.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed/extension.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteAdventurer: ContentPackage = {
  name: "dnd35-complete-adventurer",
  type: "extension",
  seedsVersion: 6,
  seeds: [
    (db) =>
      seedExtension(
        db,
        { name: DND35_COMPLETE_ADVENTURER_NAME, description: "Rogue, scout, and skill-focused options for D&D 3.5." },
        BOOK,
      ),
  ],
};

export default dnd35CompleteAdventurer;
