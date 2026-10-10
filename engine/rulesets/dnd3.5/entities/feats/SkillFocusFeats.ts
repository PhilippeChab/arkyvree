import { GeneratedFeats } from "@/engine/core/entities/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import SkillsPaths from "@/engine/rulesets/dnd3.5/model/skills/SkillsPaths.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import { FEAT_FIELDS } from "./fields.ts";

/** The feats a skill makes: its Skill Focus. */
export default class SkillFocusFeats {
  /**
   * The skill's own feat, made with it unless the ruleset has a feat of its name: its Skill Focus, of the Skill Focus
   * family, +3 to its checks, as the seeded ones are.
   */
  static make(view: RulesetView, skillName: string) {
    const name = `Skill Focus: ${skillName}`;
    return GeneratedFeats.make(
      view,
      LevelRules.GENERAL_FEATS_APTITUDE_SLUG,
      [
        {
          name,
          description: `You get a +3 bonus on all ${skillName} checks.`,
          properties: FEAT_FIELDS.toProperties({ ...FEAT_FIELDS.defaults, families: ["Skill Focus"] }),
          modifiers: [{ target: SkillsPaths.misc(skillName), operator: "add", value: "3", valueType: "number" }],
          requirements: [],
        },
      ],
      name,
    );
  }

  /** The skill's own feat a delete or a rename removes with its name: its Skill Focus, unless a character picked it. */
  static remove(view: RulesetView, skillName: string) {
    const inUse = "Cannot remove a Skill Focus feat in use by a character in this ruleset";
    return GeneratedFeats.remove(view, `Skill Focus: ${skillName}`, inUse);
  }
}
