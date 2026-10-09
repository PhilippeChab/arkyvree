import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a class, past the view and the class the handle binds. */
type Args<K extends keyof Module["entities"]> = Rest<Module["entities"][K], [RulesetView, string]>;

/** The engine bound to a class of the ruleset (`klassId`): its table, its levels and its skills. */
export default class ClassEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly klassId: string,
  ) {}

  /** The class with its fields, and the ids of the properties that keep them: refused when there's none. */
  describe() {
    return this.module.entities.describeClass(this.view, this.klassId);
  }

  /** The class's levels, each with what its feat pools hold by then. */
  describeFeatPools() {
    return this.module.entities.describeClassFeatPools(this.view, this.klassId);
  }

  /** One of the class's levels with its details: refused when the level isn't the class's. */
  describeLevel(...args: Args<"describeClassLevel">) {
    return this.module.entities.describeClassLevel(this.view, this.klassId, ...args);
  }

  /** The class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
  describeLevels() {
    return this.module.entities.describeClassLevels(this.view, this.klassId);
  }

  /** The class's class skills, each with its skill. */
  describeSkills() {
    return this.module.entities.describeClassSkills(this.view, this.klassId);
  }

  /** The spell lists the class's levels give slots in, its own first. */
  describeSpellLists() {
    return this.module.entities.describeClassSpellLists(this.view, this.klassId);
  }

  /** The class's levels, each with its spells per day by then. */
  describeSpells() {
    return this.module.entities.describeClassSpells(this.view, this.klassId);
  }

  /** The class's levels, each with the spells it knows by then. */
  describeSpellsKnown() {
    return this.module.entities.describeClassSpellsKnown(this.view, this.klassId);
  }

  /** A new level of the class: its row and join rows, what its save writes, and the level it answers once saved. */
  planLevelCreate(...args: Args<"planClassLevelCreate">) {
    return this.module.entities.planClassLevelCreate(this.view, this.klassId, ...args);
  }

  /** Deleting one of the class's levels: the class and the level, refused when the level isn't the class's. */
  planLevelDelete(...args: Args<"planClassLevelDelete">) {
    return this.module.entities.planClassLevelDelete(this.view, this.klassId, ...args);
  }

  /** One of the class's levels' edit: its new join rows, what its save writes, and what it answers. */
  planLevelEdit(...args: Args<"planClassLevelEdit">) {
    return this.module.entities.planClassLevelEdit(this.view, this.klassId, ...args);
  }

  /** Assigning a skill to the class: refused when the skill isn't the ruleset's, or the class has it already. */
  planSkillAdd(...args: Args<"planClassSkillAdd">) {
    return this.module.entities.planClassSkillAdd(this.view, this.klassId, ...args);
  }

  /** Removing a skill from the class: refused when the class doesn't have it. */
  planSkillRemove(...args: Args<"planClassSkillRemove">) {
    return this.module.entities.planClassSkillRemove(this.view, this.klassId, ...args);
  }
}
