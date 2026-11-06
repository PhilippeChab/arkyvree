import type { SkillSeed } from "@/content/pf1/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/pf1/BaseSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

/** Seeding skills: the skills with their fields, and the ability their ranks come from, a field of the ruleset's. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /** Intelligence, as the one ability skill ranks come from: a link of the ruleset's Settings. */
    async seedSkillRankAbility() {
      await this.writeSettings([
        {
          id: this.ctx.rulesetId,
          baseRules: PF1_BASE_RULES,
          write: { fields: {}, links: { skillRankAbility: this.ctx.abilityMap["Intelligence"] } },
        },
      ]);
    }

    /** The skills, each with its ability and its fields. */
    async seedSkills(skills: SkillSeed[]) {
      Object.assign(
        this.ctx.skillMap,
        await this.insertEntities(
          "skills",
          skills.map(({ name, description, fields, links }) => ({
            rulesetId: this.ctx.rulesetId,
            name,
            description,
            fields,
            links: { keyAbility: this.idOf(this.ctx.abilityMap, links.keyAbility, `${name}'s key ability`) },
          })),
        ),
      );
    }
  }
  return SeedingSkills;
}
