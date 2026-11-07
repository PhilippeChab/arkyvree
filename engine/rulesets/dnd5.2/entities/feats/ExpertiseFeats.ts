import FeatsPaths from "@/engine/rulesets/dnd5.2/model/feats/FeatsPaths.ts";
import SkillsPaths from "@/engine/rulesets/dnd5.2/model/skills/SkillsPaths.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXPERTISE_POOL } from "@/vocabulary/dnd5.2/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats from "./GeneratedFeats.ts";
import SkillProficiencyFeats from "./SkillProficiencyFeats.ts";

/**
 * The feat a skill makes in the Expertise pool (`EXPERTISE_POOL`): its Expertise, twice the Proficiency Bonus on its
 * checks, which requires its Skill Proficiency, and which a delete or a rename removes.
 */
export default class ExpertiseFeats extends GeneratedFeats {
  /** A skill's Expertise's name ("Expertise: Stealth"). */
  static nameOf(skillName: string): string {
    return `Expertise: ${skillName}`;
  }

  protected override readonly poolSlug = stripSeparators(EXPERTISE_POOL);

  /** The skill's Expertise, of its family, requiring the character's proficiency in it. */
  protected override featsOf(skillName: string) {
    return [
      {
        name: ExpertiseFeats.nameOf(skillName),
        description: `You add twice your Proficiency Bonus to ${skillName} checks.`,
        fields: FEAT_FIELDS.write({ ...FEAT_FIELDS.defaults, families: ["Expertise"] }),
        modifiers: [
          { target: SkillsPaths.expertise(skillName), operator: "set", value: "true", valueType: "boolean" } as const,
        ],
        requirements: [
          {
            level: "1",
            target: FeatsPaths.possessed(stripSeparators(SkillProficiencyFeats.nameOf(skillName))),
            operator: "equal",
            value: "true",
            valueType: "boolean",
          } as const,
        ],
      },
    ];
  }

  /** The skill's Expertise a delete or a rename removes with its name, unless a character picked it. */
  remove(skillName: string) {
    return this.removeFeat(
      ExpertiseFeats.nameOf(skillName),
      "Cannot remove an Expertise feat in use by a character in this ruleset",
    );
  }
}
