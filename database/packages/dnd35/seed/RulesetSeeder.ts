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
import type { BondContent, BookContent, DomainDefinition } from "@/database/packages/dnd35/content/types.ts";
import { ANIMAL_COMPANIONS } from "@/database/packages/dnd35/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/database/packages/dnd35/data/bonds/familiars.ts";
import { SPECIAL_MOUNTS } from "@/database/packages/dnd35/data/bonds/mounts.ts";
import { ABILITIES, CORE_RULESET, LANGUAGES, SAVES, SKILLS } from "@/database/packages/dnd35/data/core.ts";
import { TEMPLATE_ITEMS } from "@/database/packages/dnd35/data/templateItems.ts";
import { buildClassSpellLevels } from "@/database/packages/dnd35/seed/classTables.ts";
import { CopiesOnWrite } from "@/database/packages/dnd35/seed/concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "@/database/packages/dnd35/seed/concerns/SeedsAptitudes.ts";
import { SeedsClasses } from "@/database/packages/dnd35/seed/concerns/SeedsClasses.ts";
import { SeedsFeats } from "@/database/packages/dnd35/seed/concerns/SeedsFeats.ts";
import { SeedsItems } from "@/database/packages/dnd35/seed/concerns/SeedsItems.ts";
import { SeedsPowers } from "@/database/packages/dnd35/seed/concerns/SeedsPowers.ts";
import { SeedsRaces } from "@/database/packages/dnd35/seed/concerns/SeedsRaces.ts";
import { SeedsWizardSchools } from "@/database/packages/dnd35/seed/concerns/SeedsWizardSchools.ts";
import {
  coreRulesetId,
  createSystemRuleset,
  extensionContext,
  idsByName,
  loadSeedContext,
  newSeedContext,
} from "@/database/packages/dnd35/seed/context.ts";
import {
  joinsClassList,
  modifierRows,
  spellListSlots,
  uniqueBy,
} from "@/database/packages/dnd35/seed/customizationRows.ts";
import { SeederState } from "@/database/packages/dnd35/seed/SeederState.ts";
import {
  abilitiesInRules,
  languagesInRules,
  powersAptitudesInRules,
  propertiesInCustomization,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import {
  RULESET_SKILL_POINT_ABILITY_ID,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The class level each spell level opens at, for the core classes: domains and extensions gate their slots by the cleric's. */
const CORE_SPELL_LEVELS = buildClassSpellLevels(ALL_CLASSES);

/**
 * Seeds a ruleset's content, step by step: each step names the rows the steps before seeded, by their ids in its
 * context. `seedCore` seeds the core rules, `seedExtension` an extension's book; a step seeds one kind of row.
 */
export class RulesetSeeder extends include(
  SeederState,
  CopiesOnWrite,
  SeedsAptitudes,
  SeedsClasses,
  SeedsFeats,
  SeedsItems,
  SeedsPowers,
  SeedsRaces,
  SeedsWizardSchools,
) {
  /** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
  static async seedCore(db: Db) {
    const seeder = new RulesetSeeder(db, newSeedContext(await createSystemRuleset(db, CORE_RULESET)));
    await seeder.seedAptitudes(ALL_APTITUDES);
    await db
      .insert(languagesInRules)
      .values(LANGUAGES.map((language) => ({ rulesetId: seeder.ctx.rulesetId, ...language })));
    await seeder.seedRaces(ALL_RACES);
    await seeder.seedAbilities();
    await seeder.seedSkills();
    await seeder.seedSaves();
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

  /**
   * Seeds an extension of the core rules. Its content names the core's rows as a fork does: it adds only the
   * aptitudes the core lacks, and copies the core feats and spells it changes.
   */
  static async seedExtension(db: Db, ruleset: { name: string; description: string }, book: BookContent) {
    const core = await loadSeedContext(db, await coreRulesetId(db, ruleset.name));
    const seeder = new RulesetSeeder(db, await extensionContext(db, core, ruleset));
    await seeder.seedAptitudes(book.aptitudes.filter((name) => !seeder.ctx.aptMap[name]));
    await seeder.seedFeats(book.standaloneFeats);
    await seeder.seedFeats(book.classFeats);
    await seeder.cowFeatsIntoExtension(book.cowFeats);
    await seeder.seedPowers(book.spells);
    await seeder.cowSpellsIntoExtension(book.cowSpells);
    await seeder.seedDomains(book.domains, CORE_SPELL_LEVELS["Cleric"]);
    for (const klass of book.classes) await seeder.seedClass(klass);
  }

  /** The abilities, and Intelligence as the one skill points come from. */
  private async seedAbilities() {
    Object.assign(
      this.ctx.abilityMap,
      idsByName(
        await this.db
          .insert(abilitiesInRules)
          .values(ABILITIES.map((ability) => ({ rulesetId: this.ctx.rulesetId, ...ability })))
          .returning({ id: abilitiesInRules.id, name: abilitiesInRules.name }),
      ),
    );
    await this.db.insert(propertiesInCustomization).values({
      entityId: this.ctx.rulesetId,
      entityType: "rulesets",
      type: RULESET_SKILL_POINT_ABILITY_ID,
      value: this.ctx.abilityMap["Intelligence"],
    });
  }

  private async seedSaves() {
    Object.assign(
      this.ctx.saveMap,
      idsByName(
        await this.db
          .insert(savesInRules)
          .values(
            SAVES.map(({ name, description, ability }) => ({
              rulesetId: this.ctx.rulesetId,
              name,
              description,
              abilityId: this.ctx.abilityMap[ability],
            })),
          )
          .returning({ id: savesInRules.id, name: savesInRules.name }),
      ),
    );
  }

  private async seedSkills() {
    Object.assign(
      this.ctx.skillMap,
      idsByName(
        await this.db
          .insert(skillsInRules)
          .values(
            SKILLS.map(({ name, description, ability }) => ({
              rulesetId: this.ctx.rulesetId,
              name,
              description,
              primaryAbilityId: this.ctx.abilityMap[ability],
            })),
          )
          .returning({ id: skillsInRules.id, name: skillsInRules.name }),
      ),
    );
    await this.insertAll(
      propertiesInCustomization,
      SKILLS.flatMap(({ name, impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining }) =>
        [
          ...(impactedByWeight ? [{ type: SKILL_IMPACTED_BY_WEIGHT, value: "true" }] : []),
          ...(checkPenaltyMultiplier
            ? [{ type: SKILL_CHECK_PENALTY_MULTIPLIER, value: String(checkPenaltyMultiplier) }]
            : []),
          ...(usableWithoutTraining ? [{ type: SKILL_USABLE_WITHOUT_TRAINING, value: "true" }] : []),
        ].map((property) => ({ entityId: this.ctx.skillMap[name], entityType: "skills", ...property })),
      ),
    );
  }

  /** Seeds a kind of bonded creature: its aptitudes, feats, races and class. */
  async seedBond(bond: BondContent) {
    await this.seedAptitudes(bond.aptitudes);
    await this.seedFeats(bond.feats);
    await this.seedRaces(bond.races, bond.kind);
    await this.seedClass(bond.klass);
  }

  /**
   * Seeds cleric domains: each a feat taken in Cleric Domain that gives its spell list ("X Domain Spells") a slot at
   * each spell level, once the cleric casts that level (`clericSpellLevels`), and joins it to the cleric's list, plus
   * the domain's own modifiers.
   */
  async seedDomains(domains: DomainDefinition[], clericSpellLevels: Record<number, number>) {
    if (domains.length === 0) return;

    await this.seedAptitudes(domains.map((d) => `${d.name} Domain Spells`));
    await this.seedFeats(
      domains.map((d) => ({ name: `${d.name} Domain`, description: d.description, aptitudes: ["Cleric Domain"] })),
    );
    await this.insertGatedSpellSlots(
      domains.flatMap((d) => {
        const featId = this.ctx.featMap[`${d.name} Domain`];
        const list = `${stripSeparators(d.name)}domainspells`;
        return [
          ...spellListSlots(featId, "feats", list),
          joinsClassList(featId, "feats", list),
          ...modifierRows(featId, "feats", d.modifiers),
        ];
      }),
      "classes.cleric.level",
      clericSpellLevels,
    );

    const links = [];
    for (const d of domains) {
      for (const spell of d.spells) {
        const powerId = await this.ownPower(spell.name);
        if (!powerId) {
          console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${d.name} Domain)`);
          continue;
        }
        links.push({ powerId, aptitudeId: this.ctx.aptMap[`${d.name} Domain Spells`], level: spell.level });
      }
    }
    await this.insertAll(
      powersAptitudesInRules,
      uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
    );
  }
}
