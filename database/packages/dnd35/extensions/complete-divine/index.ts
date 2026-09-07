import extensionSeed from "@/database/packages/dnd35/extensions/complete-divine/v1/seed.ts";
import { seedCompleteDivineBonusSpellAbilities } from "@/database/packages/dnd35/extensions/complete-divine/v2/index.ts";
import { addFavoredSoulDamageReduction } from "@/database/packages/dnd35/extensions/complete-divine/v3/index.ts";
import { cowDamageReductionIntoCd } from "@/database/packages/dnd35/extensions/complete-divine/v4/index.ts";
import { addMissingDomainModifiers } from "@/database/packages/dnd35/extensions/complete-divine/v5/index.ts";
import { seedPrestigeClasses } from "@/database/packages/dnd35/extensions/complete-divine/v6/index.ts";
import { paraphraseDescriptions } from "@/database/packages/dnd35/extensions/complete-divine/v7/index.ts";
import { seedAdvancementFeats } from "@/database/packages/dnd35/extensions/complete-divine/v8/index.ts";
import { addFeatFamilyProperties } from "@/database/packages/dnd35/extensions/complete-divine/v9/index.ts";
import { addDweomerkeeperReqs } from "@/database/packages/dnd35/extensions/complete-divine/v10/index.ts";
import { fixCdSpellPollution } from "@/database/packages/dnd35/extensions/complete-divine/v11/index.ts";
import { addFighterBonusFeatsAndDomainOverrides } from "@/database/packages/dnd35/extensions/complete-divine/v12/index.ts";
import { fixBlighterSpellcasting } from "@/database/packages/dnd35/extensions/complete-divine/v13/index.ts";
import { addBlackFlameZealotReqs } from "@/database/packages/dnd35/extensions/complete-divine/v14/index.ts";
import { fixCdSpellRequirements } from "@/database/packages/dnd35/extensions/complete-divine/v15/index.ts";
import { seedNewCdDomains } from "@/database/packages/dnd35/extensions/complete-divine/v16/index.ts";
import { addMissingSiblingSpellAptitudes } from "@/database/packages/dnd35/extensions/complete-divine/v17/index.ts";
import { fixCdDomainSpellLinks } from "@/database/packages/dnd35/extensions/complete-divine/v18/index.ts";
import { deleteEpicFeats } from "@/database/packages/dnd35/extensions/complete-divine/v19/index.ts";
import { migrateFeatCountRequirements } from "@/database/packages/dnd35/extensions/complete-divine/v20/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteDivine: ContentPackage = {
  name: "dnd35-complete-divine",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Complete Divine — divine feats, domains, spells, and classes for D&D 3.5",
  version: 20,
  seeds: [extensionSeed],
  updates: {
    2: seedCompleteDivineBonusSpellAbilities,
    3: addFavoredSoulDamageReduction,
    4: cowDamageReductionIntoCd,
    5: addMissingDomainModifiers,
    6: seedPrestigeClasses,
    7: paraphraseDescriptions,
    8: seedAdvancementFeats,
    9: addFeatFamilyProperties,
    10: addDweomerkeeperReqs,
    11: fixCdSpellPollution,
    12: addFighterBonusFeatsAndDomainOverrides,
    13: fixBlighterSpellcasting,
    14: addBlackFlameZealotReqs,
    15: fixCdSpellRequirements,
    16: seedNewCdDomains,
    17: addMissingSiblingSpellAptitudes,
    18: fixCdDomainSpellLinks,
    19: deleteEpicFeats,
    20: migrateFeatCountRequirements,
  },
};

export default dnd35CompleteDivine;
