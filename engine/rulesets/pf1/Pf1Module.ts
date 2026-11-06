import type { RulesetModule } from "@/engine/core/module/index.ts";
import { CHARACTER_FIELDS, ENTITY_FIELDS } from "@/vocabulary/pf1/fields/index.ts";

import Pf1Characters from "./characters/Pf1Characters.ts";
import Pf1Content from "./content/Pf1Content.ts";
import type { Pf1Descriptions } from "./descriptions.ts";
import Pf1Entities, { type Pf1EntityKinds } from "./entities/Pf1Entities.ts";
import Pf1Imports from "./imports/Pf1Imports.ts";
import Pf1LevelUp from "./levelUp/Pf1LevelUp.ts";
import Pf1TargetPaths from "./Pf1TargetPaths.ts";
import Pf1Ruleset from "./ruleset/Pf1Ruleset.ts";
import { PF1_STORAGE } from "./storage/Pf1Storage.ts";

/** The Pathfinder ruleset module. */
export default class Pf1Module {
  /**
   * The Pathfinder rules as a ruleset module: its characters and their sheets, its entities, the programs it imports
   * characters from, its level-ups, what a ruleset needs to be played, its paths and fields, and how its data is stored.
   */
  static create(): RulesetModule<Pf1Descriptions, Pf1EntityKinds> {
    return {
      advancements: new Pf1LevelUp(),
      characterFields: CHARACTER_FIELDS,
      characters: new Pf1Characters(PF1_STORAGE),
      content: new Pf1Content(),
      entities: new Pf1Entities(),
      fields: ENTITY_FIELDS,
      imports: new Pf1Imports(),
      ruleset: new Pf1Ruleset(),
      storage: PF1_STORAGE,
      targetPaths: new Pf1TargetPaths(),
    };
  }
}
