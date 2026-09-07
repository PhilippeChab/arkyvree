import extensionSeed from "@/database/packages/dnd35/extensions/complete-scoundrel/v1/seed.ts";
import { fixCsParserReqs } from "@/database/packages/dnd35/extensions/complete-scoundrel/v2/index.ts";
import { addMissingSiblingSpellAptitudes } from "@/database/packages/dnd35/extensions/complete-scoundrel/v3/index.ts";
import { migrateFeatCountRequirements } from "@/database/packages/dnd35/extensions/complete-scoundrel/v4/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteScoundrel: ContentPackage = {
  name: "dnd35-complete-scoundrel",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Complete Scoundrel — feats, prestige classes, and tricks for scoundrels in D&D 3.5",
  version: 4,
  seeds: [extensionSeed],
  updates: {
    2: fixCsParserReqs,
    3: addMissingSiblingSpellAptitudes,
    4: migrateFeatCountRequirements,
  },
};

export default dnd35CompleteScoundrel;
