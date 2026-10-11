import { GeneratedFeats } from "@/engine/core/entities/index.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/model/skills/SkillsPaths.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { SKILL_FOCUS_BONUS } from "@/vocabulary/dnd3.5/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";

/** The feats a skill makes: its Skill Focus, which a delete or a rename removes. */
export default class SkillFocusFeats extends GeneratedFeats {
  protected override readonly poolSlug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;

  /** The skill's own feat: its Skill Focus, of the Skill Focus family, +3 to its checks, as the seeded ones are. */
  protected override featsOf(skillName: string) {
    return [
      {
        name: `Skill Focus: ${skillName}`,
        description: `You get a +${SKILL_FOCUS_BONUS} bonus on all ${skillName} checks.`,
        properties: FEAT_FIELDS.toProperties({ ...FEAT_FIELDS.defaults, families: ["Skill Focus"] }),
        modifiers: [
          {
            target: SkillsPaths.misc(skillName),
            operator: "add",
            value: String(SKILL_FOCUS_BONUS),
            valueType: "number",
          },
        ],
        requirements: [],
      },
    ];
  }

  /** The skill's own feat a delete or a rename removes with its name: its Skill Focus, unless a character picked it. */
  remove(skillName: string) {
    return this.removeFeat(
      `Skill Focus: ${skillName}`,
      "Cannot remove a Skill Focus feat in use by a character in this ruleset",
    );
  }
}
