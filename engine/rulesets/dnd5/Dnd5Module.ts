import type { RulesetModule } from "@/engine/core/module/index.ts";
import { CHARACTER_FIELDS, ENTITY_FIELDS } from "@/vocabulary/dnd5/fields/index.ts";

import Dnd5Characters from "./characters/Dnd5Characters.ts";
import Dnd5Content from "./content/Dnd5Content.ts";
import type { Dnd5Descriptions } from "./descriptions.ts";
import Dnd5TargetPaths from "./Dnd5TargetPaths.ts";
import Dnd5Entities, { type Dnd5EntityKinds } from "./entities/Dnd5Entities.ts";
import Dnd5Imports from "./imports/Dnd5Imports.ts";
import Dnd5LevelUp from "./levelUp/Dnd5LevelUp.ts";
import Dnd5Ruleset from "./ruleset/Dnd5Ruleset.ts";
import { DND5_STORAGE } from "./storage/Dnd5Storage.ts";

/** The D&D 5th Edition ruleset module. */
export default class Dnd5Module {
  /**
   * The D&D 5th Edition rules as a ruleset module: its characters and their sheets, its entities, the programs it imports
   * characters from, its level-ups, what a ruleset needs to be played, its paths and fields, and how its data is stored.
   */
  static create(): RulesetModule<Dnd5Descriptions, Dnd5EntityKinds> {
    return {
      advancements: new Dnd5LevelUp(),
      characterFields: CHARACTER_FIELDS,
      characters: new Dnd5Characters(DND5_STORAGE),
      content: new Dnd5Content(),
      entities: new Dnd5Entities(),
      fields: ENTITY_FIELDS,
      imports: new Dnd5Imports(),
      ruleset: new Dnd5Ruleset(),
      storage: DND5_STORAGE,
      targetPaths: new Dnd5TargetPaths(),
    };
  }
}
