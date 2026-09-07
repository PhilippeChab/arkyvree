import extensionSeed from "@/database/packages/dnd35/extensions/complete-warrior/v1/seed.ts";
import { seedCwSpellsAndDomains } from "@/database/packages/dnd35/extensions/complete-warrior/v2/index.ts";
import { seedPrestigeClasses } from "@/database/packages/dnd35/extensions/complete-warrior/v3/index.ts";
import { seedMissingCwModifiers } from "@/database/packages/dnd35/extensions/complete-warrior/v4/index.ts";
import { seedUncannyBlow } from "@/database/packages/dnd35/extensions/complete-warrior/v5/index.ts";
import { fixUncannyBlowPaths } from "@/database/packages/dnd35/extensions/complete-warrior/v6/index.ts";
import { cowSnatchArrowsIntoCw } from "@/database/packages/dnd35/extensions/complete-warrior/v7/index.ts";
import { addMissingCwModifiers } from "@/database/packages/dnd35/extensions/complete-warrior/v8/index.ts";
import { paraphraseDescriptions } from "@/database/packages/dnd35/extensions/complete-warrior/v9/index.ts";
import { seedAdvancementFeats } from "@/database/packages/dnd35/extensions/complete-warrior/v10/index.ts";
import { fixCowSpellLevels } from "@/database/packages/dnd35/extensions/complete-warrior/v11/index.ts";
import { addFighterBonusFeatPicks } from "@/database/packages/dnd35/extensions/complete-warrior/v12/index.ts";
import { removePrestigeCasterType } from "@/database/packages/dnd35/extensions/complete-warrior/v13/index.ts";
import { fixCwParserReqs } from "@/database/packages/dnd35/extensions/complete-warrior/v14/index.ts";
import { fixCwSpellRequirements } from "@/database/packages/dnd35/extensions/complete-warrior/v15/index.ts";
import { fixHexbladeSpellsKnown } from "@/database/packages/dnd35/extensions/complete-warrior/v16/index.ts";
import { addMissingSiblingSpellAptitudes } from "@/database/packages/dnd35/extensions/complete-warrior/v17/index.ts";
import { deleteEpicFeats } from "@/database/packages/dnd35/extensions/complete-warrior/v18/index.ts";
import { migrateFeatCountRequirements } from "@/database/packages/dnd35/extensions/complete-warrior/v19/index.ts";
import { backfillCompleteWarriorBondedGrants } from "@/database/packages/dnd35/extensions/complete-warrior/v20/index.ts";
import { rerunCompleteWarriorBondedGrants } from "@/database/packages/dnd35/extensions/complete-warrior/v21/index.ts";
import { attachLockedFavoredEnemyScaffolding } from "@/database/packages/dnd35/extensions/complete-warrior/v22/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteWarrior: ContentPackage = {
  name: "dnd35-complete-warrior",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Complete Warrior — martial feats and options for D&D 3.5",
  version: 22,
  seeds: [extensionSeed],
  updates: {
    2: seedCwSpellsAndDomains,
    3: seedPrestigeClasses,
    4: seedMissingCwModifiers,
    5: seedUncannyBlow,
    6: fixUncannyBlowPaths,
    7: cowSnatchArrowsIntoCw,
    8: addMissingCwModifiers,
    9: paraphraseDescriptions,
    10: seedAdvancementFeats,
    11: fixCowSpellLevels,
    12: addFighterBonusFeatPicks,
    13: removePrestigeCasterType,
    14: fixCwParserReqs,
    15: fixCwSpellRequirements,
    16: fixHexbladeSpellsKnown,
    17: addMissingSiblingSpellAptitudes,
    18: deleteEpicFeats,
    19: migrateFeatCountRequirements,
    20: backfillCompleteWarriorBondedGrants,
    21: rerunCompleteWarriorBondedGrants,
    22: attachLockedFavoredEnemyScaffolding,
  },
};

export default dnd35CompleteWarrior;
