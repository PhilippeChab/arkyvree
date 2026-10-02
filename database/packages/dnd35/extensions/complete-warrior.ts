import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed/extension.ts";
import { removeUnusedFeat } from "@/database/packages/dnd35/seed/removeUnusedFeat.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteWarrior: ContentPackage = {
  name: "dnd35-complete-warrior",
  type: "extension",
  seedsVersion: 22,
  seeds: [
    (db) =>
      seedExtension(
        db,
        { name: DND35_COMPLETE_WARRIOR_NAME, description: "Martial feats and combat options for D&D 3.5." },
        BOOK,
      ),
  ],
  updates: {
    // The eye of Gruumsh grants Blind-Fight: its own Blind-fight feat was granted by nothing (#68)
    23: (db) => removeUnusedFeat(db, DND35_COMPLETE_WARRIOR_NAME, "Blind-fight (Eye of Gruumsh)"),
  },
};

export default dnd35CompleteWarrior;
