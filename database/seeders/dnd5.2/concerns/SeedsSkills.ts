import { setFlag } from "@/content/core/builders/customization/modifiers.ts";
import { eq } from "@/content/core/builders/customization/requirements.ts";
import { expertise, skillProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { SkillSeed } from "@/content/dnd5.2/builders/skills/types.ts";
import type { BaseSeeder } from "@/database/seeders/dnd5.2/BaseSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXPERTISE_POOL, SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * A skill's feats, as the engine makes them with a skill a ruleset adds (`SkillProficiencyFeats`, `ExpertiseFeats`):
 * its Skill Proficiency, in the pool of any skill's proficiency, and its Expertise, which requires proficiency in it
 * however the character has it, in the Expertise pool, each of its family and generated.
 */
function skillFeats(skill: string): FeatSeed[] {
  const slug = stripSeparators(skill);
  return [
    {
      name: skillProficiency(skill),
      description: `You have proficiency in the ${skill} skill.`,
      aptitudes: [SKILL_PROFICIENCIES_POOL],
      modifiers: [setFlag(`skills.${slug}.proficient`)],
      fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Skill Proficiency"] },
    },
    {
      name: expertise(skill),
      description: `You have Expertise in the ${skill} skill: your Proficiency Bonus is doubled for its checks.`,
      aptitudes: [EXPERTISE_POOL],
      modifiers: [setFlag(`skills.${slug}.expertise`)],
      requirements: [eq(`skills.${slug}.proficient`)],
      fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Expertise"] },
    },
  ];
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
