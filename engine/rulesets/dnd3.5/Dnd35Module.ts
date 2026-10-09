import type { RulesetModule } from "@/engine/core/module/index.ts";

import Dnd35Characters from "./characters/Dnd35Characters.ts";
import Dnd35Content from "./content/Dnd35Content.ts";
import Dnd35PropertyTypes from "./Dnd35PropertyTypes.ts";
import Dnd35TargetPaths from "./Dnd35TargetPaths.ts";
import Dnd35Entities from "./entities/Dnd35Entities.ts";
import Dnd35LevelUp from "./levelUp/Dnd35LevelUp.ts";
import Dnd35Ruleset from "./ruleset/Dnd35Ruleset.ts";

/** The 3.5 rules' module: its parts, by their own types. */
export interface Dnd35RulesetModule extends RulesetModule {
  characters: Dnd35Characters;
  content: Dnd35Content;
  entities: Dnd35Entities;
  levelUp: Dnd35LevelUp;
  ruleset: Dnd35Ruleset;
}

/** The 3.5 ruleset module. */
export default class Dnd35Module {
  /**
   * The 3.5 rules as a ruleset module: its characters and their sheets, its entities, its level-ups, what a ruleset
   * needs to be played, its paths and properties.
   */
  static create(): Dnd35RulesetModule {
    return {
      characters: new Dnd35Characters(),
      content: new Dnd35Content(),
      entities: new Dnd35Entities(),
      levelUp: new Dnd35LevelUp(),
      ruleset: new Dnd35Ruleset(),

      createTargetPaths() {
        return new Dnd35TargetPaths();
      },

      createPropertyTypes() {
        return new Dnd35PropertyTypes();
      },
    };
  }
}
