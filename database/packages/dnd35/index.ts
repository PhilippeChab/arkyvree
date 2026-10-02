import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { seedCore } from "@/database/packages/dnd35/seed/core.ts";
import { removeUnusedFeat } from "@/database/packages/dnd35/seed/removeUnusedFeat.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35: ContentPackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  seeds: [seedCore],
  updates: {
    // The monk grants Improved Unarmed Strike: its own Unarmed Strike feat was granted by nothing (#68)
    50: (db) => removeUnusedFeat(db, DND35_RULESET_NAME, "Unarmed Strike (Monk)"),
  },
};

export default dnd35;
