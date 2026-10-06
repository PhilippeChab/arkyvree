import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/srd/aptitudes.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/srd/domains/data.ts";
import { ALL_FEATS } from "@/database/packages/dnd35-from-parser/generated/srd/feats/index.ts";
import {
  GOODS,
  MAGIC_ARMOR,
  MAGIC_SHIELDS,
  MAGIC_WEAPONS,
  RINGS,
  RODS,
  STAFFS,
  WONDROUS_ITEMS,
} from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import { ALL_RACES } from "@/database/packages/dnd35-from-parser/generated/srd/races/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/srd/spells/index.ts";
import { WIZARD_SCHOOLS } from "@/database/packages/dnd35-from-parser/generated/srd/wizard-schools/data.ts";
import { ANIMAL_COMPANIONS } from "@/database/packages/dnd35/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/database/packages/dnd35/data/bonds/familiars.ts";
import { SPECIAL_MOUNTS } from "@/database/packages/dnd35/data/bonds/mounts.ts";
import { ABILITIES, CORE_RULESET, LANGUAGES, SAVES, SKILLS } from "@/database/packages/dnd35/data/core.ts";
import { TEMPLATE_ITEMS } from "@/database/packages/dnd35/data/templateItems.ts";
import { buildClassSpellLevels } from "@/database/packages/dnd35/seed/classTables.ts";
import { createSystemRuleset, newSeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { Db } from "@/server/database/index.ts";

/** The class level each spell level opens at, for the core classes: domains and extensions gate their slots by the cleric's. */
export const CORE_SPELL_LEVELS = buildClassSpellLevels(ALL_CLASSES);

/** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
export async function seedCore(db: Db) {
  const seeder = new RulesetSeeder(db, newSeedContext(await createSystemRuleset(db, CORE_RULESET)));
  await seeder.seedAptitudes(ALL_APTITUDES);
  await seeder.seedLanguages(LANGUAGES);
  await seeder.seedRaces(ALL_RACES);
  await seeder.seedAbilities(ABILITIES);
  await seeder.seedSkills(SKILLS);
  await seeder.seedSaves(SAVES);
  await seeder.seedFeats(ALL_FEATS);
  for (const klass of ALL_CLASSES) await seeder.seedClass(klass);

  // The templates first, a magic one among them (elven chain): the other items are made from them
  const items = [
    ...GOODS,
    ...MAGIC_ARMOR,
    ...MAGIC_SHIELDS,
    ...MAGIC_WEAPONS,
    ...WONDROUS_ITEMS,
    ...RINGS,
    ...RODS,
    ...STAFFS,
  ];
  const templates = await seeder.seedItems([...TEMPLATE_ITEMS, ...items.filter((item) => item.isTemplate)], {
    isTemplate: true,
  });
  await seeder.seedItems(
    items.filter((item) => !item.isTemplate),
    { templateMap: templates },
  );

  await seeder.seedPowers(ALL_SPELLS);
  await seeder.seedWizardSchools(WIZARD_SCHOOLS, CORE_SPELL_LEVELS["Wizard"]);
  await seeder.seedDomains(ALL_DOMAINS, CORE_SPELL_LEVELS["Cleric"]);
  for (const bond of [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS]) await seeder.seedBond(bond);
}
