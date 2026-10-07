import type { AbilitySeed } from "@/database/packages/dnd35/content/abilities/types.ts";
import type { LanguageSeed } from "@/database/packages/dnd35/content/languages/types.ts";
import type { SaveSeed } from "@/database/packages/dnd35/content/saves/types.ts";
import type { SkillSeed } from "@/database/packages/dnd35/content/skills/types.ts";
import { BaseSeeder } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import {
  abilitiesInRules,
  languagesInRules,
  propertiesInCustomization,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { toRulesetProperties } from "@/engine/rulesets/dnd3.5/ruleset/rulesetFields.ts";
import { toSkillProperties } from "@/engine/rulesets/dnd3.5/skills/skillFields.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding a base ruleset's own rules: its abilities, saves, skills and languages. */
export function SeedsCoreRules<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingCoreRules extends Base {
    /** The abilities, and Intelligence as the one skill points come from. */
    async seedAbilities(abilities: AbilitySeed[]) {
      Object.assign(
        this.ctx.abilityMap,
        BaseSeeder.idsByName(
          await this.db
            .insert(abilitiesInRules)
            .values(abilities.map((ability) => ({ rulesetId: this.ctx.rulesetId, ...ability })))
            .returning({ id: abilitiesInRules.id, name: abilitiesInRules.name }),
        ),
      );
      await this.db
        .insert(propertiesInCustomization)
        .values(toRulesetProperties(this.ctx.rulesetId, { skillPointAbilityId: this.ctx.abilityMap["Intelligence"] }));
    }

    /** The languages. */
    async seedLanguages(languages: LanguageSeed[]) {
      await this.db
        .insert(languagesInRules)
        .values(languages.map((language) => ({ rulesetId: this.ctx.rulesetId, ...language })));
    }

    /** The saves, each with its ability. */
    async seedSaves(saves: SaveSeed[]) {
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
    async seedSkills(skills: SkillSeed[]) {
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
          toSkillProperties(this.ctx.skillMap[name], {
            impactedByWeight: impactedByWeight ?? false,
            checkPenaltyMultiplier: checkPenaltyMultiplier ?? 1,
            usableWithoutTraining: usableWithoutTraining ?? false,
          }),
        ),
      );
    }
  }
  return SeedingCoreRules;
}
