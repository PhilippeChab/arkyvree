import type { GeneratedFeatRemoval, GeneratedFeatsWrite, PropertiesWrite } from "@/engine/core/module/index.ts";
import type { FeatFields, SkillFields } from "@/engine/rulesets/dnd3.5/module/rules/index.ts";

/** What a ruleset writes when a skill is saved or deleted: its fields, and the feat that's the skill's own. */
export interface SkillsEffects {
  /** The feat that's the skill's own (its Skill Focus), made with the skill. */
  generatedFeats(skillName: string): GeneratedFeatsWrite<FeatFields>;
  /** The skill's fields, as the properties stored in place of those it stored before. */
  properties(skillId: string, fields: SkillFields): PropertiesWrite;
  /** The skill's own feat, removed with the skill (or its old name), unless a character picked it. */
  removedFeat(skillName: string): GeneratedFeatRemoval;
}
