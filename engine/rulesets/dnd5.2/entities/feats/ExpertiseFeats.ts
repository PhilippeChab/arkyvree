import SkillsPaths from "@/engine/rulesets/dnd5.2/model/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXPERTISE_POOL } from "@/vocabulary/dnd5.2/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats, { type GeneratedFeat } from "./GeneratedFeats.ts";

/**
 * The feat a skill makes in the Expertise pool (`EXPERTISE_POOL`): its Expertise, twice the Proficiency Bonus on its
 * checks, which requires proficiency in it however the character has it (its Skill Proficiency feat, or a homebrew
 * feat's modifier), and which a delete or a rename removes.
 */
export default class ExpertiseFeats extends GeneratedFeats {
  /** The skill's Expertise, of its family, requiring the character's proficiency in it (`skills.<skill>.proficient`). */
  static describe(skillName: string): GeneratedFeat[] {
    return [
      {
        name: ExpertiseFeats.nameOf(skillName),
        description: `You add twice your Proficiency Bonus to ${skillName} checks.`,
        fields: FEAT_FIELDS.write({ families: ["Expertise"] }),
        modifiers: [
          { target: SkillsPaths.expertise(skillName), operator: "set", value: "true", valueType: "boolean" } as const,
        ],
        requirements: [
          {
            level: "1",
            target: SkillsPaths.proficient(skillName),
            operator: "equal",
            value: "true",
            valueType: "boolean",
          } as const,
        ],
      },
    ];
  }

  /** A skill's Expertise's name ("Expertise: Stealth"). */
  static nameOf(skillName: string): string {
    return `Expertise: ${skillName}`;
  }

  protected override readonly poolSlug = stripSeparators(EXPERTISE_POOL);

  /** The skill's Expertise (`describe`). */
  protected override featsOf(skillName: string) {
    return ExpertiseFeats.describe(skillName);
  }

  /** The skill's Expertise a delete or a rename removes with its name, unless a character picked it. */
  remove(skillName: string) {
    return this.removeFeat(
      ExpertiseFeats.nameOf(skillName),
      "Cannot remove an Expertise feat in use by a character in this ruleset",
    );
  }
}
