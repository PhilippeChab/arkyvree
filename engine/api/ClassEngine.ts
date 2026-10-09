import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/**
 * What its module answers of a class, past the view and the class the handle binds.
 *
 * What a class's levels answer, past the class the handle binds.
 */
type LevelArgs<K extends keyof Levels> = Rest<Levels[K], [string]>;

/** The classes' levels, as the ruleset's module has them. */
type Levels = ReturnType<Module["entities"]["classLevels"]>;

/** What a class's class skills answer, past the class the handle binds. */
type SkillArgs<K extends keyof Skills> = Rest<Skills[K], [string]>;

/** The classes' class skills, as the ruleset's module has them. */
type Skills = ReturnType<Module["entities"]["classSkills"]>;

/** The engine bound to a class of the ruleset (`klassId`): its table, its levels and its skills. */
export default class ClassEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly klassId: string,
  ) {}

  /** The class with its fields, and the ids of the properties that keep them: refused when there's none. */
  describe() {
    return this.module.entities.of(this.view, "klasses").describe(this.klassId);
  }

  /** The class's levels, each with what its feat pools hold by then. */
  describeFeatPools() {
    return this.module.entities.classTables(this.view).describeFeatPools(this.klassId);
  }

  /** One of the class's levels with its details: refused when the level isn't the class's. */
  describeLevel(...args: LevelArgs<"describe">) {
    return this.module.entities.classLevels(this.view).describe(this.klassId, ...args);
  }

  /** The class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
  describeLevels() {
    return this.module.entities.classLevels(this.view).describeAll(this.klassId);
  }

  /** The class's class skills, each with its skill. */
  describeSkills() {
    return this.module.entities.classSkills(this.view).describe(this.klassId);
  }

  /** The spell lists the class's levels give slots in, its own first. */
  describeSpellLists() {
    return this.module.entities.classTables(this.view).describeSpellLists(this.klassId);
  }

  /** The class's levels, each with its spells per day by then. */
  describeSpells() {
    return this.module.entities.classTables(this.view).describeSpells(this.klassId);
  }

  /** The class's levels, each with the spells it knows by then. */
  describeSpellsKnown() {
    return this.module.entities.classTables(this.view).describeSpellsKnown(this.klassId);
  }

  /** A new level of the class: its row and join rows, what its save writes, and the level it answers once saved. */
  planLevelCreate(...args: LevelArgs<"planCreate">) {
    return this.module.entities.classLevels(this.view).planCreate(this.klassId, ...args);
  }

  /** Deleting one of the class's levels: the class and the level, refused when the level isn't the class's. */
  planLevelDelete(...args: LevelArgs<"planDelete">) {
    return this.module.entities.classLevels(this.view).planDelete(this.klassId, ...args);
  }

  /** One of the class's levels' edit: its new join rows, what its save writes, and what it answers. */
  planLevelEdit(...args: LevelArgs<"planEdit">) {
    return this.module.entities.classLevels(this.view).planEdit(this.klassId, ...args);
  }

  /** Assigning a skill to the class: refused when the skill isn't the ruleset's, or the class has it already. */
  planSkillAdd(...args: SkillArgs<"planAdd">) {
    return this.module.entities.classSkills(this.view).planAdd(this.klassId, ...args);
  }

  /** Removing a skill from the class: refused when the class doesn't have it. */
  planSkillRemove(...args: SkillArgs<"planRemove">) {
    return this.module.entities.classSkills(this.view).planRemove(this.klassId, ...args);
  }
}
