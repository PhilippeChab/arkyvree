import SkillsPaths from "@/engine/rulesets/dnd5/model/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats, { type GeneratedFeat } from "./GeneratedFeats.ts";

/**
 * The feat a skill makes in the pool of any skill's proficiency (`SKILL_PROFICIENCIES_POOL`): its Skill Proficiency,
 * which a class's, a background's or a species' grant or pick takes, and a delete or a rename removes.
 */
export default class SkillProficiencyFeats extends GeneratedFeats {
  /** The skill's Skill Proficiency, of its family, which makes its owner proficient in it. */
  static describe(skillName: string): GeneratedFeat[] {
    return [
      {
        name: SkillProficiencyFeats.nameOf(skillName),
        description: `You add your Proficiency Bonus to ${skillName} checks.`,
        fields: FEAT_FIELDS.write({ families: ["Skill Proficiency"] }),
        modifiers: [
          { target: SkillsPaths.proficient(skillName), operator: "set", value: "true", valueType: "boolean" } as const,
        ],
        requirements: [],
      },
    ];
  }

  /** A skill's Skill Proficiency's name ("Skill Proficiency: Athletics"). */
  static nameOf(skillName: string): string {
    return `Skill Proficiency: ${skillName}`;
  }

  protected override readonly poolSlug = stripSeparators(SKILL_PROFICIENCIES_POOL);

  /** The skill's Skill Proficiency (`describe`). */
  protected override featsOf(skillName: string) {
    return SkillProficiencyFeats.describe(skillName);
  }

  /** The skill's Skill Proficiency a delete or a rename removes with its name, unless a character picked it. */
  remove(skillName: string) {
    return this.removeFeat(
      SkillProficiencyFeats.nameOf(skillName),
      "Cannot remove a Skill Proficiency feat in use by a character in this ruleset",
    );
  }
}
