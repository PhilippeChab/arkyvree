import extensionSeed from "@/database/packages/dnd35/extensions/complete-adventurer/v1/seed.ts";
import { deleteEpicFeats } from "@/database/packages/dnd35/extensions/complete-adventurer/v2/index.ts";
import { removeInvalidClassAbilityRequirements } from "@/database/packages/dnd35/extensions/complete-adventurer/v3/index.ts";
import { migrateFeatCountRequirements } from "@/database/packages/dnd35/extensions/complete-adventurer/v4/index.ts";
import { backfillCompleteAdventurerBondedGrants } from "@/database/packages/dnd35/extensions/complete-adventurer/v5/index.ts";
import { rerunCompleteAdventurerBondedGrants } from "@/database/packages/dnd35/extensions/complete-adventurer/v6/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteAdventurer: ContentPackage = {
  name: "dnd35-complete-adventurer",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Complete Adventurer — rogue, scout, and skill-focused options for D&D 3.5",
  version: 6,
  seeds: [extensionSeed],
  updates: {
    2: deleteEpicFeats,
    3: removeInvalidClassAbilityRequirements,
    4: migrateFeatCountRequirements,
    5: backfillCompleteAdventurerBondedGrants,
    6: rerunCompleteAdventurerBondedGrants,
  },
};

export default dnd35CompleteAdventurer;
