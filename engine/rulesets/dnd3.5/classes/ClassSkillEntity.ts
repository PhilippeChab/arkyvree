import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";

import ClassEntity from "./ClassEntity.ts";

/** A class's class skills: what it lists, and what assigning or removing one takes. */
export default class ClassSkillEntity {
  /** A class's class skills, each with its skill. */
  static describe(view: RulesetView, klassId: string) {
    const klass = ClassEntity.find(view, klassId);
    return view.rulesetData.klassSkillsWithSkillsByKlass.get(klass.id) ?? [];
  }

  /**
   * Assigning a skill to a class: the class and the skill, as the view has them. Refused when either isn't the
   * ruleset's, or the class has the skill already.
   */
  static planAdd(view: RulesetView, klassId: string, skillId: string) {
    const { rulesetData } = view;
    const klass = ClassEntity.find(view, klassId);
    const skill = rulesetData.find("skills", skillId);
    if (!skill) throw new RulesError("not-found", "Skill not found in this ruleset");
    if (rulesetData.klassSkillsByKlassId.get(klass.id)?.some((ks) => ks.skillId === skill.id))
      throw new RulesError("conflict", "Skill is already assigned to this class");
    return { klass, skill };
  }

  /**
   * Removing a skill from a class: the class, its class skill and the skill, as the view has them. Refused when the
   * class isn't the ruleset's, or doesn't have the skill.
   */
  static planRemove(view: RulesetView, klassId: string, skillId: string) {
    const { rulesetData } = view;
    const klass = ClassEntity.find(view, klassId);
    const klassSkill = rulesetData.klassSkillsByKlassId.get(klass.id)?.find((ks) => ks.skillId === skillId);
    if (!klassSkill) throw new RulesError("not-found", "Skill is not assigned to this class");
    return { klass, klassSkill, skill: rulesetData.skillsById.get(skillId) };
  }
}
