import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** Seeding skills: the skills with their fields, and the ability their points come from, a field of the ruleset's. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /** Intelligence, as the one ability skill points come from: a link of the ruleset's Settings. */
    async seedSkillPointAbility() {
      await this.writeSettings([
        {
          id: this.ctx.rulesetId,
          write: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("rulesets", {
            skillPointAbilityId: this.ctx.abilityMap["Intelligence"],
          }),
        },
      ]);
    }

    /** The skills, each with its ability and its fields. */
    async seedSkills(skills: SkillSeed[]) {
      Object.assign(
        this.ctx.skillMap,
        await this.insertEntities(
          "skills",
          skills.map(
            ({ name, description, ability, impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining }) => ({
              rulesetId: this.ctx.rulesetId,
              name,
              description,
              fields: Engine.forRules(DND35_BASE_RULES).toFieldsWrite("skills", {
                impactedByWeight: impactedByWeight ?? false,
                checkPenaltyMultiplier: checkPenaltyMultiplier ?? 1,
                usableWithoutTraining: usableWithoutTraining ?? false,
              }).fields,
              links: { keyAbility: this.ctx.abilityMap[ability] },
            }),
          ),
        ),
      );
    }
  }
  return SeedingSkills;
}
