import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** Seeding skills: the skills with their fields, and the ability their points come from, a field of the ruleset's. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /** Intelligence, as the one ability skill points come from: a field of the ruleset's. */
    async seedSkillPointAbility() {
      await this.writeFields([
        {
          id: this.ctx.rulesetId,
          type: "rulesets",
          values: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("rulesets", {
            skillPointAbilityId: this.ctx.abilityMap["Intelligence"],
          }),
        },
      ]);
    }

    /** The skills, each with its ability, and their fields. */
    async seedSkills(skills: SkillSeed[]) {
      Object.assign(
        this.ctx.skillMap,
        await this.insertEntities(
          "skills",
          skills.map(({ name, description, ability }) => ({
            rulesetId: this.ctx.rulesetId,
            name,
            description,
            links: { keyAbility: this.ctx.abilityMap[ability] },
          })),
        ),
      );
      await this.writeFields(
        skills.map(({ name, impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining }) => ({
          id: this.ctx.skillMap[name],
          type: "skills",
          values: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("skills", {
            impactedByWeight: impactedByWeight ?? false,
            checkPenaltyMultiplier: checkPenaltyMultiplier ?? 1,
            usableWithoutTraining: usableWithoutTraining ?? false,
          }),
        })),
      );
    }
  }
  return SeedingSkills;
}
