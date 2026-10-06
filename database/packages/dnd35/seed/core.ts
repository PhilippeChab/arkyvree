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
import { ANIMAL_COMPANIONS } from "@/database/packages/dnd35/content/animalCompanions.ts";
import { ABILITIES, CORE_RULESET, LANGUAGES, SAVES, SKILLS } from "@/database/packages/dnd35/content/core.ts";
import { FAMILIARS } from "@/database/packages/dnd35/content/familiars.ts";
import { SPECIAL_MOUNTS } from "@/database/packages/dnd35/content/mounts.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import { seedBond } from "@/database/packages/dnd35/seed/bonds.ts";
import { buildClassSpellLevels, seedClass } from "@/database/packages/dnd35/seed/classes.ts";
import {
  createSystemRuleset,
  idsByName,
  newSeedContext,
  type SeedContext,
} from "@/database/packages/dnd35/seed/context.ts";
import { insertAll } from "@/database/packages/dnd35/seed/customization.ts";
import { seedDomains } from "@/database/packages/dnd35/seed/domains.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { seedItems, TEMPLATE_ITEMS } from "@/database/packages/dnd35/seed/items.ts";
import { seedPowers } from "@/database/packages/dnd35/seed/powers.ts";
import { seedRaces } from "@/database/packages/dnd35/seed/races.ts";
import { seedWizardSchools } from "@/database/packages/dnd35/seed/wizardSchools.ts";
import {
  abilitiesInRules,
  languagesInRules,
  propertiesInCustomization,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import {
  RULESET_SKILL_POINT_ABILITY_ID,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

/** The class level each spell level opens at, for the core classes: domains and extensions gate their slots by the cleric's. */
export const CORE_SPELL_LEVELS = buildClassSpellLevels(ALL_CLASSES);

/** The abilities, and Intelligence as the one skill points come from. */
async function seedAbilities(db: Db, ctx: SeedContext) {
  Object.assign(
    ctx.abilityMap,
    idsByName(
      await db
        .insert(abilitiesInRules)
        .values(ABILITIES.map((ability) => ({ rulesetId: ctx.rulesetId, ...ability })))
        .returning({ id: abilitiesInRules.id, name: abilitiesInRules.name }),
    ),
  );
  await db.insert(propertiesInCustomization).values({
    entityId: ctx.rulesetId,
    entityType: "rulesets",
    type: RULESET_SKILL_POINT_ABILITY_ID,
    value: ctx.abilityMap["Intelligence"],
  });
}

async function seedSaves(db: Db, ctx: SeedContext) {
  Object.assign(
    ctx.saveMap,
    idsByName(
      await db
        .insert(savesInRules)
        .values(
          SAVES.map(({ name, description, ability }) => ({
            rulesetId: ctx.rulesetId,
            name,
            description,
            abilityId: ctx.abilityMap[ability],
          })),
        )
        .returning({ id: savesInRules.id, name: savesInRules.name }),
    ),
  );
}

async function seedSkills(db: Db, ctx: SeedContext) {
  Object.assign(
    ctx.skillMap,
    idsByName(
      await db
        .insert(skillsInRules)
        .values(
          SKILLS.map(({ name, description, ability }) => ({
            rulesetId: ctx.rulesetId,
            name,
            description,
            primaryAbilityId: ctx.abilityMap[ability],
          })),
        )
        .returning({ id: skillsInRules.id, name: skillsInRules.name }),
    ),
  );
  await insertAll(
    db,
    propertiesInCustomization,
    SKILLS.flatMap(({ name, impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining }) =>
      [
        ...(impactedByWeight ? [{ type: SKILL_IMPACTED_BY_WEIGHT, value: "true" }] : []),
        ...(checkPenaltyMultiplier
          ? [{ type: SKILL_CHECK_PENALTY_MULTIPLIER, value: String(checkPenaltyMultiplier) }]
          : []),
        ...(usableWithoutTraining ? [{ type: SKILL_USABLE_WITHOUT_TRAINING, value: "true" }] : []),
      ].map((property) => ({ entityId: ctx.skillMap[name], entityType: "skills", ...property })),
    ),
  );
}

/** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
export async function seedCore(db: Db) {
  const ctx = newSeedContext(await createSystemRuleset(db, CORE_RULESET));
  await seedAptitudes(db, ctx, ALL_APTITUDES);
  await db.insert(languagesInRules).values(LANGUAGES.map((language) => ({ rulesetId: ctx.rulesetId, ...language })));
  await seedRaces(db, ctx, ALL_RACES);
  await seedAbilities(db, ctx);
  await seedSkills(db, ctx);
  await seedSaves(db, ctx);
  await seedFeats(db, ctx, ALL_FEATS);
  for (const klass of ALL_CLASSES) await seedClass(db, ctx, klass);

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
  const templates = await seedItems(
    db,
    ctx.rulesetId,
    [...TEMPLATE_ITEMS, ...items.filter((item) => item.isTemplate)],
    { isTemplate: true },
  );
  await seedItems(
    db,
    ctx.rulesetId,
    items.filter((item) => !item.isTemplate),
    { templateMap: templates },
  );

  await seedPowers(db, ctx, ALL_SPELLS);
  await seedWizardSchools(db, ctx, WIZARD_SCHOOLS, CORE_SPELL_LEVELS["Wizard"]);
  await seedDomains(db, ctx, ALL_DOMAINS, CORE_SPELL_LEVELS["Cleric"]);
  for (const bond of [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS]) await seedBond(db, ctx, bond);
}
