import type { RulesetModule } from "@/engine/core/module/index.ts";
import { CHARACTER_FIELDS, ENTITY_FIELDS } from "@/vocabulary/dnd5.2/fields/index.ts";

import Dnd52Characters from "./characters/Dnd52Characters.ts";
import Dnd52Content from "./content/Dnd52Content.ts";
import type { Dnd52Descriptions } from "./descriptions.ts";
import Dnd52Entities, { type Dnd52EntityKinds } from "./entities/Dnd52Entities.ts";
import Dnd52Imports from "./imports/Dnd52Imports.ts";
import Dnd52LevelUp from "./levelUp/Dnd52LevelUp.ts";
import Dnd52TargetPaths from "./Dnd52TargetPaths.ts";
import Dnd52Ruleset from "./ruleset/Dnd52Ruleset.ts";
import { DND52_STORAGE } from "./storage/Dnd52Storage.ts";

/** The Pathfinder ruleset module. */
export default class Dnd52Module {
  /**
   * The Pathfinder rules as a ruleset module: its characters and their sheets, its entities, the programs it imports
   * characters from, its level-ups, what a ruleset needs to be played, its paths and fields, and how its data is stored.
   */
  static create(): RulesetModule<Dnd52Descriptions, Dnd52EntityKinds> {
    return {
      advancements: new Dnd52LevelUp(),
      characterFields: CHARACTER_FIELDS,
      characters: new Dnd52Characters(DND52_STORAGE),
      content: new Dnd52Content(),
      entities: new Dnd52Entities(),
      fields: ENTITY_FIELDS,
      imports: new Dnd52Imports(),
      ruleset: new Dnd52Ruleset(),
      storage: DND52_STORAGE,
      targetPaths: new Dnd52TargetPaths(),
    };
  }
}
