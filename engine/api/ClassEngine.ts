import type { RulesetView } from "@/engine/core/view/index.ts";

import type { EntityKinds, Module, Rest } from "./Modules.ts";

/**
 * What its module answers of a class, past the view and the class the handle binds.
 *
 * What a class's levels answer, past the class the handle binds.
 */
type LevelArgs<K extends keyof Levels> = Rest<Levels[K], [string]>;

/** The classes' levels, as the ruleset's classes have them. */
type Levels = ReturnType<EntityKinds["klasses"]["levels"]>;

/** What a class's class skills answer, past the class the handle binds. */
type SkillArgs<K extends keyof Skills> = Rest<Skills[K], [string]>;

/** The classes' class skills, as the ruleset's classes have them. */
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
    return this.classes.table().describeFeatPools(this.klassId);
  }

  /** One of the class's levels with its details: refused when the level isn't the class's. */
  describeLevel(...args: LevelArgs<"describe">) {
    return this.classes.levels().describe(this.klassId, ...args);
  }

  /** The class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
  describeLevels() {
    return this.classes.levels().describeAll(this.klassId);
  }

  /** The class's class skills, each with its skill. */
  describeSkills() {
    return this.classes.skills().describe(this.klassId);
  }

  /** The spell lists the class's levels give slots in, its own first. */
  describeSpellLists() {
    return this.classes.table().describeSpellLists(this.klassId);
  }

  /** The class's levels, each with its spells per day by then. */
  describeSpells() {
    return this.classes.table().describeSpells(this.klassId);
  }

  /** The class's levels, each with the spells it knows by then. */
  describeSpellsKnown() {
    return this.classes.table().describeSpellsKnown(this.klassId);
  }

  /** A new level of the class: its row and join rows, what its save writes, and the level it answers once saved. */
  planLevelCreate(...args: LevelArgs<"planCreate">) {
    return this.classes.levels().planCreate(this.klassId, ...args);
  }

  /** Deleting one of the class's levels: the class and the level, refused when the level isn't the class's. */
  planLevelDelete(...args: LevelArgs<"planDelete">) {
    return this.classes.levels().planDelete(this.klassId, ...args);
  }

  /** One of the class's levels' edit: its new join rows, what its save writes, and what it answers. */
  planLevelEdit(...args: LevelArgs<"planEdit">) {
    return this.classes.levels().planEdit(this.klassId, ...args);
  }

  /** Assigning a skill to the class: refused when the skill isn't the ruleset's, or the class has it already. */
  planSkillAdd(...args: SkillArgs<"planAdd">) {
    return this.classes.skills().planAdd(this.klassId, ...args);
  }

  /** Removing a skill from the class: refused when the class doesn't have it. */
  planSkillRemove(...args: SkillArgs<"planRemove">) {
    return this.classes.skills().planRemove(this.klassId, ...args);
  }
}
