import SkillsPaths from "@/engine/rulesets/pf1/model/skills/SkillsPaths.ts";
import LevelRules from "@/engine/rulesets/pf1/rules/LevelRules.ts";
import { SKILL_FOCUS_BONUS, SKILL_FOCUS_HIGH_BONUS, SKILL_FOCUS_HIGH_RANKS } from "@/vocabulary/pf1/feats.ts";

import { FEAT_FIELDS } from "./fields.ts";
import GeneratedFeats, { type GeneratedFeat } from "./GeneratedFeats.ts";

/** The feats a skill makes: its Skill Focus, which a delete or a rename removes. */
export default class SkillFocusFeats extends GeneratedFeats {
  /** What a removal is refused with while a character picked the feat. */
  private static readonly IN_USE = "Cannot remove a Skill Focus feat in use by a character in this ruleset";

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

  /** The skills' names: each brings its own. */
  protected override ownerNames() {
    return this.view.rulesetData.rows("skills").map(({ name }) => name);
  }

  /**
   * What frees the names a skill's feats take, for a new skill (`GeneratedFeats.free`): one that stands for a skill the
   * ruleset deleted (`standsIn`) keeps that skill's feats, restored without it.
   */
  freeFor(skillName: string, standsIn: boolean) {
    return this.free(skillName, SkillFocusFeats.IN_USE, undefined, standsIn);
  }

  /** The skill's own feat a delete or a rename removes with its name: its Skill Focus, unless a character picked it. */
  remove(skillName: string) {
    return this.removeOf(skillName, SkillFocusFeats.IN_USE);
  }

  /** The skill's feats, as its new name brings them (`GeneratedFeats.rename`). */
  renameWith(skillName: string, newName: string) {
    return this.rename(skillName, newName, SkillFocusFeats.IN_USE);
  }
}
