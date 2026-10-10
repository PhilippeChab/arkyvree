import type { RulesetView } from "@/engine/core/view/index.ts";

import type { EntityKinds, Module } from "./Modules.ts";

/** A class's levels, as the ruleset's classes have them. */
type Levels = ReturnType<EntityKinds["klasses"]["levels"]>;

/** A class's class skills, as the ruleset's classes have them. */
type Skills = ReturnType<EntityKinds["klasses"]["skills"]>;

/** The engine bound to a class of the ruleset (`klassId`): its table, its levels and its skills. */
export default class ClassEngine {
  constructor(
    view: RulesetView,
    module: Module,
    private readonly klassId: string,
  ) {
    this.classes = module.entities.of(view, "klasses");
  }

  /** The ruleset's classes, whose parts its operations ask. */
  private readonly classes: EntityKinds["klasses"];

  /** The class with its fields, and the ids of the properties that keep them: refused when there's none. */
  describe() {
    return this.classes.describe(this.klassId);
  }

  /** The class's levels, each with what its feat pools hold by then. */
  describeFeatPools() {
    return this.classes.table(this.klassId).describeFeatPools();
  }

  /** One of the class's levels with its details: refused when the level isn't the class's. */
  describeLevel(...args: Parameters<Levels["describe"]>) {
    return this.classes.levels(this.klassId).describe(...args);
  }

  /** The class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
  describeLevels() {
    return this.classes.levels(this.klassId).describeAll();
  }

  /** The class's class skills, each with its skill. */
  describeSkills() {
    return this.classes.skills(this.klassId).describe();
  }

  /** The spell lists the class's levels give slots in, its own first. */
  describeSpellLists() {
    return this.classes.table(this.klassId).describeSpellLists();
  }

  /** The class's levels, each with its spells per day by then. */
  describeSpells() {
    return this.classes.table(this.klassId).describeSpells();
  }

  /** The class's levels, each with the spells it knows by then. */
  describeSpellsKnown() {
    return this.classes.table(this.klassId).describeSpellsKnown();
  }

  /** A new level of the class: its row and join rows, what its form writes, and the level it answers once written. */
  planLevelCreate(...args: Parameters<Levels["planCreate"]>) {
    return this.classes.levels(this.klassId).planCreate(...args);
  }

  /** Deleting one of the class's levels: the class and the level, refused when the level isn't the class's. */
  planLevelDelete(...args: Parameters<Levels["planDelete"]>) {
    return this.classes.levels(this.klassId).planDelete(...args);
  }

  /** One of the class's levels' edit: its new join rows, what its form writes, and what it answers. */
  planLevelEdit(...args: Parameters<Levels["planEdit"]>) {
    return this.classes.levels(this.klassId).planEdit(...args);
  }

  /** Assigning a skill to the class: refused when the skill isn't the ruleset's, or the class has it already. */
  planSkillAdd(...args: Parameters<Skills["planAdd"]>) {
    return this.classes.skills(this.klassId).planAdd(...args);
  }

  /** Removing a skill from the class: refused when the class doesn't have it. */
  planSkillRemove(...args: Parameters<Skills["planRemove"]>) {
    return this.classes.skills(this.klassId).planRemove(...args);
  }
}
