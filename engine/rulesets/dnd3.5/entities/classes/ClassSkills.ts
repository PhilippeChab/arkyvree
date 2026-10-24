import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import { CLASS_SKILL_LINKS } from "./classSkillLinks.ts";

/** A class's class skills (`klass`, as the view has it): what it lists, and what assigning or removing one takes. */
export default class ClassSkills {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.view.rulesetData);
  }

  /** The class's class skills, each with its skill. */
  describe() {
    return this.dnd35.klassSkillsWithSkillsByKlass.get(this.klass.id) ?? [];
  }

  /**
   * Assigning a skill to the class: the class as the view has it, the class skill's row (its skill: a copy's for its
   * source's id), and what its activity records.
   * Refused when the skill isn't the ruleset's (as invalid, naming it: the request's), or the class has it already.
   */
  planAdd(skillId: string) {
    const skill = new RequestIds(this.view.rulesetData, "this ruleset").find("skills", skillId);
    if (this.dnd35.klassSkillsByKlass.get(this.klass.id)?.some((ks) => ks.skillId === skill.id))
      throw new RulesError("conflict", "Skill is already assigned to this class");
    return {
      activity: { skillId: skill.id, entityName: this.klass.name, [CLASS_SKILL_LINKS.targetName]: skill.name },
      join: CLASS_SKILL_LINKS.join,
      owner: this.klass,
      row: { skillId: skill.id },
    };
  }

  /**
   * Removing a skill from the class: the class as the view has it, the skill its class skill names, and what its
   * activity records. Refused when the class doesn't have the skill.
   */
  planRemove(skillId: string) {
    const { rulesetData } = this.view;
    const dnd35 = Dnd35View.of(rulesetData);
    const klassSkill = dnd35.klassSkillsByKlass.get(this.klass.id)?.find((ks) => ks.skillId === skillId);
    if (!klassSkill) throw new RulesError("not-found", "Skill is not assigned to this class");
    const skill = dnd35.skillsById.get(skillId);
    return {
      activity: {
        skillId: klassSkill.skillId,
        rulesetId: this.view.ruleset.id,
        entityName: this.klass.name,
        [CLASS_SKILL_LINKS.targetName]: skill?.name,
      },
      join: CLASS_SKILL_LINKS.join,
      owner: this.klass,
      toId: klassSkill.skillId,
    };
  }
}
