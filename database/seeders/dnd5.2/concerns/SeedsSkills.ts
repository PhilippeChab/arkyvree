import type { FeatFields, FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { SkillSeed } from "@/content/dnd5.2/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd5.2/BaseSeeder.ts";
import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { DND52_BASE_RULES } from "@/vocabulary/dnd5.2/baseRules.ts";

/**
 * A skill's feats, as the engine makes them for a skill a ruleset adds (`describeBroughtEntities`): its Skill
 * Proficiency and its Expertise, which the engine describes alone, so a seeded skill's and a new one's are the same.
 */
function skillFeats(skill: string): FeatSeed[] {
  return Engine.forRules(DND52_BASE_RULES)
    .describeBroughtEntities("skills", skill)
    .map(({ description, fields, modifiers, name, pools, requirements }) => ({
      name,
      description,
      aptitudes: pools,
      fields: fields as FeatFields,
      modifiers,
      // A condition each: the engine's are conditions alone, none a group
      requirements: requirements.flatMap(({ operator, target, value, valueType }) =>
        operator && target && value !== null && valueType ? [{ operator, target, value, valueType }] : [],
      ),
    }));
}

/** Seeding skills: the skills with the ability their checks add, and each one's feats. */
export function SeedsSkills<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class SeedingSkills extends Base {
    /**
     * The skills, each with its ability, and its Skill Proficiency and Expertise (`skillFeats`), which a class's, a
     * background's or a species' grant or pick takes.
     */
    async seedSkills(skills: SkillSeed[]) {
      Object.assign(
        this.ctx.skillMap,
        await this.insertEntities(
          "skills",
          skills.map(({ name, description, links }) => ({
            rulesetId: this.ctx.rulesetId,
            name,
            description,
            links: { keyAbility: this.idOf(this.ctx.abilityMap, links.keyAbility, `${name}'s key ability`) },
          })),
        ),
      );
      await this.seedFeats(skills.flatMap(({ name }) => skillFeats(name)));
    }
  }
  return SeedingSkills;
}
