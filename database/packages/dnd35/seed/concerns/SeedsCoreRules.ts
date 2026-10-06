import type { AbilityDefinition } from "@/database/packages/dnd35/content/abilities/types.ts";
import type { LanguageDefinition } from "@/database/packages/dnd35/content/languages/types.ts";
import type { SaveDefinition } from "@/database/packages/dnd35/content/saves/types.ts";
import type { SkillDefinition } from "@/database/packages/dnd35/content/skills/types.ts";
import { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import {
  abilitiesInRules,
  languagesInRules,
  propertiesInCustomization,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Constructor } from "@/server/mixins.ts";
import {
  RULESET_SKILL_POINT_ABILITY_ID,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

/** Seeding a base ruleset's own rules: its abilities, saves, skills and languages. */
export function SeedsCoreRules<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingCoreRules extends Base {
    /** The abilities, and Intelligence as the one skill points come from. */
    async seedAbilities(abilities: AbilityDefinition[]) {
      Object.assign(
        this.ctx.abilityMap,
        BaseSeeder.idsByName(
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

    /** The languages. */
    async seedLanguages(languages: LanguageDefinition[]) {
      await this.db
        .insert(languagesInRules)
        .values(languages.map((language) => ({ rulesetId: this.ctx.rulesetId, ...language })));
    }

    /** The saves, each with its ability. */
    async seedSaves(saves: SaveDefinition[]) {
      Object.assign(
        this.ctx.saveMap,
        BaseSeeder.idsByName(
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
    async seedSkills(skills: SkillDefinition[]) {
      Object.assign(
        this.ctx.skillMap,
        BaseSeeder.idsByName(
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
  return SeedingCoreRules;
}
