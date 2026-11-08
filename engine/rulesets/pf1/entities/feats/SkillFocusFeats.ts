import SkillsPaths from "@/engine/rulesets/pf1/model/skills/SkillsPaths.ts";
import LevelRules from "@/engine/rulesets/pf1/rules/LevelRules.ts";
import { SKILL_FOCUS_BONUS, SKILL_FOCUS_HIGH_BONUS, SKILL_FOCUS_HIGH_RANKS } from "@/vocabulary/pf1/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats, { type GeneratedFeat } from "./GeneratedFeats.ts";

/** The feats a skill makes: its Skill Focus, which a delete or a rename removes. */
export default class SkillFocusFeats extends GeneratedFeats {
  /**
   * The skill's own feat: its Skill Focus, of the Skill Focus family, as the Core Rulebook's seeded ones are: +3 to its
   * checks, +6 from 10 ranks in it. One modifier, whose value a template makes +3 or +6 by its ranks, as a made entity's
   * modifiers take no requirement of their own.
   */
  static describe(skillName: string): GeneratedFeat[] {
    const higher = SKILL_FOCUS_HIGH_BONUS - SKILL_FOCUS_BONUS;
    const ranks = `[${SkillsPaths.rank(skillName)}]`;
    return [
      {
        name: `Skill Focus: ${skillName}`,
        description: `You get a +${SKILL_FOCUS_BONUS} bonus on all checks involving ${skillName}. If you have ${SKILL_FOCUS_HIGH_RANKS} or more ranks in that skill, this bonus increases to +${SKILL_FOCUS_HIGH_BONUS}.`,
        fields: FEAT_FIELDS.write({ ...FEAT_FIELDS.defaults, families: ["Skill Focus"] }),
        modifiers: [
          {
            target: SkillsPaths.misc(skillName),
            operator: "add",
            value: `{{ ${SKILL_FOCUS_BONUS} + ${higher} * min(1, max(0, ${ranks} - ${SKILL_FOCUS_HIGH_RANKS - 1})) }}`,
            valueType: "number",
          },
        ],
        requirements: [],
      },
    ];
  }

  protected override readonly poolSlug = LevelRules.GENERAL_FEATS_APTITUDE_SLUG;

  /** The skill's own feat (`describe`). */
  protected override featsOf(skillName: string) {
    return SkillFocusFeats.describe(skillName);
  }

  /** The skill's own feat a delete or a rename removes with its name: its Skill Focus, unless a character picked it. */
  remove(skillName: string) {
    return this.removeFeat(
      `Skill Focus: ${skillName}`,
      "Cannot remove a Skill Focus feat in use by a character in this ruleset",
    );
  }
}
