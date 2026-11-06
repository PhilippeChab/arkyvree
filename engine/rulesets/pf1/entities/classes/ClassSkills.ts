import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { Klass, Pf1Kinds } from "@/engine/rulesets/pf1/view/rows.ts";

import { CLASS_SKILL_LINKS } from "./classSkillLinks.ts";

/** A class's class skills (`klass`, as the view has it): what it lists, and what assigning or removing one takes. */
export default class ClassSkills {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** The view's Pathfinder lists and indices. */
  private get pf1(): Pf1View {
    return Pf1View.of(this.view.rulesetData);
  }

  /** The class's class skills (its `classSkill` links), by their skills' names, each with its skill's name. */
  describe() {
    return this.view.rulesetData.nameLinks(this.pf1.classSkillsOf(this.klass.id));
  }

  /**
   * Assigning a skill to the class: the class as the view has it, its `classSkill` link (its skill: a copy's for its
   * source's id), and what its activity records: the class's name, and the skill as every link's names it (`toId`,
   * `toName`). Refused when the skill isn't the ruleset's (as invalid, naming it: the request's), or the class has it
   * already.
   */
  planAdd(skillId: string) {
    const skill = new RequestIds<Pf1Kinds>(this.view.rulesetData, "this ruleset").find("skills", skillId);
    if (this.pf1.classSkillsOf(this.klass.id).some((link) => link.toId === skill.id))
      throw new RulesError("conflict", "Skill is already assigned to this class");
    return {
      activity: { toId: skill.id, entityName: this.klass.name, toName: skill.name },
      link: { role: CLASS_SKILL_LINKS.role, toId: skill.id, toType: "skills" },
      owner: this.klass,
    };
  }

  /**
   * Removing a skill from the class: the class as the view has it, the role and the skill of its `classSkill` link, and
   * what its activity records, as `planAdd`'s does. Refused when the class doesn't have the skill.
   */
  planRemove(skillId: string) {
    const { rulesetData } = this.view;
    const pf1 = Pf1View.of(rulesetData);
    const link = pf1.classSkillsOf(this.klass.id).find((held) => held.toId === skillId);
    if (!link) {
      const [skill, klass] = [rulesetData.labelOf("skills"), rulesetData.labelOf("classes").toLowerCase()];
      throw new RulesError("not-found", `${skill} is not assigned to this ${klass}`);
    }
    const skill = pf1.skillsById.get(skillId);
    return {
      activity: {
        toId: link.toId,
        rulesetId: this.view.ruleset.id,
        entityName: this.klass.name,
        toName: skill?.name,
      },
      owner: this.klass,
      role: link.role,
      toId: link.toId,
    };
  }
}
