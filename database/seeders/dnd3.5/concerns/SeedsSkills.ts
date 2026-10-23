import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** Seeding skills: the skills with their fields, and the ability their points come from, a field of the ruleset's. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /** Intelligence, as the one ability skill points come from: a property of the ruleset's. */
    async seedSkillPointAbility() {
      await this.insertProperties(
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
        await this.insertEntities(
          "skills",
          skills.map(({ name, description, ability }) => ({
            rulesetId: this.ctx.rulesetId,
            name,
            description,
            primaryAbilityId: this.ctx.abilityMap[ability],
          })),
        ),
      );
      await this.insertProperties(
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
