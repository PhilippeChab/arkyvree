import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import type { Klass } from "@/shared/relations.ts";

/** A class's class skills (`klass`, as the view has it): what it lists, and what assigning or removing one takes. */
export default class ClassSkills {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** The class's class skills, each with its skill. */
  describe() {
    return this.view.rulesetData.klassSkillsWithSkillsByKlass.get(this.klass.id) ?? [];
  }

  /**
   * Assigning a skill to the class: the class and the skill, as the view has them (a copy's for its source's id).
   * Refused when the skill isn't the ruleset's (as invalid, naming it: the request's), or the class has it already.
   */
  planAdd(skillId: string) {
    const skill = new RequestIds(this.view.rulesetData, "this ruleset").find("skills", skillId);
    if (this.view.rulesetData.klassSkillsByKlass.get(this.klass.id)?.some((ks) => ks.skillId === skill.id))
      throw new RulesError("conflict", "Skill is already assigned to this class");
    return { klass: this.klass, skill };
  }

  /**
   * Removing a skill from the class: the class, its class skill and the skill, as the view has them. Refused when the
   * class doesn't have the skill.
   */
  planRemove(skillId: string) {
    const { rulesetData } = this.view;
    const klassSkill = rulesetData.klassSkillsByKlass.get(this.klass.id)?.find((ks) => ks.skillId === skillId);
    if (!klassSkill) throw new RulesError("not-found", "Skill is not assigned to this class");
    return { klass: this.klass, klassSkill, skill: rulesetData.skillsById.get(skillId) };
  }
}
