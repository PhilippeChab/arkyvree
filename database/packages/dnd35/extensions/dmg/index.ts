import extensionSeed from "@/database/packages/dnd35/extensions/dmg/v1/seed.ts";
import { seedDmgBonusSpellAbilities } from "@/database/packages/dnd35/extensions/dmg/v2/index.ts";
import { seedMissingDmgModifiers } from "@/database/packages/dnd35/extensions/dmg/v3/index.ts";
import { addPrestigeClassRequirements } from "@/database/packages/dnd35/extensions/dmg/v4/index.ts";
import { convertStandaloneToOrChains } from "@/database/packages/dnd35/extensions/dmg/v5/index.ts";
import { cowPrestigeFeatsIntoDmg } from "@/database/packages/dnd35/extensions/dmg/v6/index.ts";
import { addSpellcastingRequirements } from "@/database/packages/dnd35/extensions/dmg/v7/index.ts";
import { addGraceModifier } from "@/database/packages/dnd35/extensions/dmg/v8/index.ts";
import { addMissingModifiers } from "@/database/packages/dnd35/extensions/dmg/v9/index.ts";
import { paraphraseDescriptions } from "@/database/packages/dnd35/extensions/dmg/v10/index.ts";
import { seedAdvancementFeats } from "@/database/packages/dnd35/extensions/dmg/v11/index.ts";
import { addHierophantMetamagicReq } from "@/database/packages/dnd35/extensions/dmg/v12/index.ts";
import { fixCowSpellLevels } from "@/database/packages/dnd35/extensions/dmg/v13/index.ts";
import { addArcaneTricksterReqs } from "@/database/packages/dnd35/extensions/dmg/v14/index.ts";
import { addMissingDmgCowSpells } from "@/database/packages/dnd35/extensions/dmg/v15/index.ts";
import { migrateFeatCountRequirements } from "@/database/packages/dnd35/extensions/dmg/v16/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35Dmg: ContentPackage = {
  name: "dnd35-dmg",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Dungeon Master's Guide — prestige classes for D&D 3.5",
  version: 16,
  seeds: [extensionSeed],
  updates: {
    2: seedDmgBonusSpellAbilities,
    3: seedMissingDmgModifiers,
    4: addPrestigeClassRequirements,
    5: convertStandaloneToOrChains,
    6: cowPrestigeFeatsIntoDmg,
    7: addSpellcastingRequirements,
    8: addGraceModifier,
    9: addMissingModifiers,
    10: paraphraseDescriptions,
    11: seedAdvancementFeats,
    12: addHierophantMetamagicReq,
    13: fixCowSpellLevels,
    14: addArcaneTricksterReqs,
    15: addMissingDmgCowSpells,
    16: migrateFeatCountRequirements,
  },
};

export default dnd35Dmg;
