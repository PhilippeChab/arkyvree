import type { BondContent, DomainDefinition } from "@/database/packages/dnd35/content/types.ts";
import type { ABILITIES, LANGUAGES, SAVES, SKILLS } from "@/database/packages/dnd35/data/core.ts";
import { CopiesOnWrite } from "@/database/packages/dnd35/seed/concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "@/database/packages/dnd35/seed/concerns/SeedsAptitudes.ts";
import { SeedsClasses } from "@/database/packages/dnd35/seed/concerns/SeedsClasses.ts";
import { SeedsFeats } from "@/database/packages/dnd35/seed/concerns/SeedsFeats.ts";
import { SeedsItems } from "@/database/packages/dnd35/seed/concerns/SeedsItems.ts";
import { SeedsPowers } from "@/database/packages/dnd35/seed/concerns/SeedsPowers.ts";
import { SeedsRaces } from "@/database/packages/dnd35/seed/concerns/SeedsRaces.ts";
import { SeedsWizardSchools } from "@/database/packages/dnd35/seed/concerns/SeedsWizardSchools.ts";
import { idsByName } from "@/database/packages/dnd35/seed/context.ts";
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
import { include } from "@/server/mixins.ts";
import {
  RULESET_SKILL_POINT_ABILITY_ID,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Seeds a ruleset's content, step by step: a step seeds one kind of row, and names the rows the steps before seeded by
 * their ids in its context. It holds no content: `seedCore` and `seedExtension` give it the core rules and a book.
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
  /** The abilities, and Intelligence as the one skill points come from. */
  async seedAbilities(abilities: typeof ABILITIES) {
    Object.assign(
      this.ctx.abilityMap,
      idsByName(
        await this.db
          .insert(abilitiesInRules)
          .values(abilities.map((ability) => ({ rulesetId: this.ctx.rulesetId, ...ability })))
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

  /** The languages. */
  async seedLanguages(languages: typeof LANGUAGES) {
    await this.db
      .insert(languagesInRules)
      .values(languages.map((language) => ({ rulesetId: this.ctx.rulesetId, ...language })));
  }

  /** The saves, each with its ability. */
  async seedSaves(saves: typeof SAVES) {
    Object.assign(
      this.ctx.saveMap,
      idsByName(
        await this.db
          .insert(savesInRules)
          .values(
            saves.map(({ name, description, ability }) => ({
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

  /** The skills, each with its ability, and their properties. */
  async seedSkills(skills: typeof SKILLS) {
    Object.assign(
      this.ctx.skillMap,
      idsByName(
        await this.db
          .insert(skillsInRules)
          .values(
            skills.map(({ name, description, ability }) => ({
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
      skills.flatMap(({ name, impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining }) =>
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
}
