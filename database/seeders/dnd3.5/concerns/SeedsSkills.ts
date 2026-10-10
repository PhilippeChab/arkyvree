import { DND35_BASE_RULES } from "@/content/dnd3.5/baseRules.ts";
import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { propertiesInCustomization, skillsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding skills: the skills with their fields, and the ability their points come from, a field of the ruleset's. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /** Intelligence, as the one ability skill points come from: a property of the ruleset's. */
    async seedSkillPointAbility() {
      await this.db.insert(propertiesInCustomization).values(
        this.propertyRows(
          this.ctx.rulesetId,
          "rulesets",
          Engine.forRules(DND35_BASE_RULES).toEntityProperties("rulesets", {
            skillPointAbilityId: this.ctx.abilityMap["Intelligence"],
          }),
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
          this.propertyRows(
            this.ctx.skillMap[name],
            "skills",
            Engine.forRules(DND35_BASE_RULES).toEntityProperties("skills", {
              impactedByWeight: impactedByWeight ?? false,
              checkPenaltyMultiplier: checkPenaltyMultiplier ?? 1,
              usableWithoutTraining: usableWithoutTraining ?? false,
            }),
          ),
        ),
      );
    }
  }
  return SeedingSkills;
}
