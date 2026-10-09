import type { RulesetView } from "@/engine/core/types.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of the ruleset's entities, past the view the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView]>;

/** The engine bound to the ruleset's skills: a skill described, and what saving or deleting one writes. */
export default class SkillsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** A skill with the fields its properties keep: refused when the view has none. */
  describe(...args: Args<"describeSkill">) {
    return this.module.entities.describeSkill(this.view, ...args);
  }

  /** The skills with the fields their properties keep: those given (a save's), or the view's. */
  describeAll<T extends { id: string }>(skills: T[], properties?: { entityId: string; type: string; value: string }[]) {
    return this.module.entities.describeSkills(this.view, skills, properties);
  }

  /** A new skill's row, what its save writes beside it, and the skill it answers once saved. */
  planCreate(...args: Args<"planSkillCreate">) {
    return this.module.entities.planSkillCreate(this.view, ...args);
  }

  /** Deleting a skill: the skill, and what its delete writes, its Skill Focus removed. */
  planDelete(...args: Args<"planSkillDelete">) {
    return this.module.entities.planSkillDelete(this.view, ...args);
  }

  /** A skill's edit: the skill, its new row, what it writes, and what it answers. */
  planEdit(...args: Args<"planSkillEdit">) {
    return this.module.entities.planSkillEdit(this.view, ...args);
  }
}
