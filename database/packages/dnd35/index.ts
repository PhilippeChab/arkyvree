import rulesetSeeds from "@/database/packages/dnd35/v1/index.ts";
import { seedDomains, seedWarDomainWeapon } from "@/database/packages/dnd35/v2/index.ts";
import { seedWizardSchools } from "@/database/packages/dnd35/v3/index.ts";
import { seedBonusCasterLevels } from "@/database/packages/dnd35/v4/index.ts";
import { seedBonusCasterLevel } from "@/database/packages/dnd35/v5/index.ts";
import { seedBonusSpellAbilities } from "@/database/packages/dnd35/v6/index.ts";
import { seedMissingModifiers } from "@/database/packages/dnd35/v7/index.ts";
import { seedHumanRacialBonuses } from "@/database/packages/dnd35/v8/index.ts";
import { fixWeaponSlots } from "@/database/packages/dnd35/v9/index.ts";
import { fixWeaponNames } from "@/database/packages/dnd35/v10/index.ts";
import { fixCriticalRangeAndFeats } from "@/database/packages/dnd35/v11/index.ts";
import { addMartialProfAntiStacking } from "@/database/packages/dnd35/v12/index.ts";
import { restructureRangerCombatStyle } from "@/database/packages/dnd35/v13/index.ts";
import { addMonkBonusFeats } from "@/database/packages/dnd35/v14/index.ts";
import { addDivineGraceModifier } from "@/database/packages/dnd35/v15/index.ts";
import { addMonkAcBonus } from "@/database/packages/dnd35/v16/index.ts";
import { addKlassCasterType } from "@/database/packages/dnd35/v17/index.ts";
import { paraphraseDescriptions } from "@/database/packages/dnd35/v18/index.ts";
import { addFeatFamilyProperties } from "@/database/packages/dnd35/v19/index.ts";
import { migrateFeatGlobPatterns } from "@/database/packages/dnd35/v20/index.ts";
import { seedSrdGoods } from "@/database/packages/dnd35/v21/index.ts";
import { seedMagicItems } from "@/database/packages/dnd35/v22/index.ts";
import { addMagicItemModifiers } from "@/database/packages/dnd35/v23/index.ts";
import { addKnowledgePsionics } from "@/database/packages/dnd35/v24/index.ts";
import { fixKnowledgeClassSkills } from "@/database/packages/dnd35/v25/index.ts";
import { fixKnowledgeClassSkillsV2 } from "@/database/packages/dnd35/v26/index.ts";
import { fixKnowledgeClassSkillsHardcoded } from "@/database/packages/dnd35/v27/index.ts";
import { addNewMagicItemModifiers } from "@/database/packages/dnd35/v28/index.ts";
import { migrateWarDomainWeaponModifiers } from "@/database/packages/dnd35/v29/index.ts";
import { addMissingSkills } from "@/database/packages/dnd35/v30/index.ts";
import { removeRunJumpModifier } from "@/database/packages/dnd35/v31/index.ts";
import { fixSpellClassLevelRequirements } from "@/database/packages/dnd35/v32/index.ts";
import { refactorDomains } from "@/database/packages/dnd35/v33/index.ts";
import { backfillCowDomainAptitudeLinks } from "@/database/packages/dnd35/v34/index.ts";
import { fixSrdDomainSpellLinks } from "@/database/packages/dnd35/v35/index.ts";
import { removeSpellRequirements } from "@/database/packages/dnd35/v36/index.ts";
import { addDescriptionFreeFeats } from "@/database/packages/dnd35/v37/index.ts";
import { fixSpellAptitudeLevels } from "@/database/packages/dnd35/v38/index.ts";
import { fixWizardSpellsKnown } from "@/database/packages/dnd35/v39/index.ts";
import { fixSpecialistSpellLevels } from "@/database/packages/dnd35/v40/index.ts";
import { moveWeaponPaths } from "@/database/packages/dnd35/v41/index.ts";
import { renameWeaponTouch } from "@/database/packages/dnd35/v42/index.ts";
import { linkMagicItemTemplates } from "@/database/packages/dnd35/v43/index.ts";
import { fixMagicItemNames } from "@/database/packages/dnd35/v44/index.ts";
import { seedFamiliars } from "@/database/packages/dnd35/v45/index.ts";
import { seedAnimalCompanions } from "@/database/packages/dnd35/v46/index.ts";
import { seedMounts } from "@/database/packages/dnd35/v47/index.ts";
import { seedFavoredEnemies } from "@/database/packages/dnd35/v48/index.ts";
import { seedFavoredEnemySpecialization } from "@/database/packages/dnd35/v49/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const seedDomainsAll = async (db: Db) => {
  await seedDomains(db);
  await seedWarDomainWeapon(db);
};

const dnd35: ContentPackage = {
  name: "dnd35",
  type: "base_ruleset",
  description: "Dungeons & Dragons 3.5 Edition core rules",
  version: 49,
  seeds: [...rulesetSeeds],
  updates: {
    2: seedDomainsAll,
    3: seedWizardSchools,
    4: seedBonusCasterLevels,
    5: seedBonusCasterLevel,
    6: seedBonusSpellAbilities,
    7: seedMissingModifiers,
    8: seedHumanRacialBonuses,
    9: fixWeaponSlots,
    10: fixWeaponNames,
    11: fixCriticalRangeAndFeats,
    12: addMartialProfAntiStacking,
    13: restructureRangerCombatStyle,
    14: addMonkBonusFeats,
    15: addDivineGraceModifier,
    16: addMonkAcBonus,
    17: addKlassCasterType,
    18: paraphraseDescriptions,
    19: addFeatFamilyProperties,
    20: migrateFeatGlobPatterns,
    21: seedSrdGoods,
    22: seedMagicItems,
    23: addMagicItemModifiers,
    24: addKnowledgePsionics,
    25: fixKnowledgeClassSkills,
    26: fixKnowledgeClassSkillsV2,
    27: fixKnowledgeClassSkillsHardcoded,
    28: addNewMagicItemModifiers,
    29: migrateWarDomainWeaponModifiers,
    30: addMissingSkills,
    31: removeRunJumpModifier,
    32: fixSpellClassLevelRequirements,
    33: refactorDomains,
    34: backfillCowDomainAptitudeLinks,
    35: fixSrdDomainSpellLinks,
    36: removeSpellRequirements,
    37: addDescriptionFreeFeats,
    38: fixSpellAptitudeLevels,
    39: fixWizardSpellsKnown,
    40: fixSpecialistSpellLevels,
    41: moveWeaponPaths,
    42: renameWeaponTouch,
    43: linkMagicItemTemplates,
    44: fixMagicItemNames,
    45: seedFamiliars,
    46: seedAnimalCompanions,
    47: seedMounts,
    48: seedFavoredEnemies,
    49: seedFavoredEnemySpecialization,
  },
};

export default dnd35;
