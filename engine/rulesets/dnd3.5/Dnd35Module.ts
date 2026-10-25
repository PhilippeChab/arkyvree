import type { RulesetModule } from "@/engine/core/module/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

import Dnd35Characters from "./characters/Dnd35Characters.ts";
import Dnd35Content, { type SeededFields } from "./content/Dnd35Content.ts";
import type { Dnd35Descriptions } from "./descriptions.ts";
import Dnd35TargetPaths from "./Dnd35TargetPaths.ts";
import Dnd35Entities, { type Dnd35EntityKinds } from "./entities/Dnd35Entities.ts";
import Dnd35Imports from "./imports/Dnd35Imports.ts";
import Dnd35LevelUp from "./levelUp/Dnd35LevelUp.ts";
import Dnd35Ruleset from "./ruleset/Dnd35Ruleset.ts";
import { DND35_STORAGE } from "./storage/Dnd35Storage.ts";
import { KIND_LABELS } from "./view/kindLabels.ts";

/** The 3.5 ruleset module. */
export default class Dnd35Module {
  /**
   * The 3.5 rules as a ruleset module: its characters and their sheets, its entities, the programs it imports
   * characters from, its level-ups, what a ruleset needs to be played, its paths and fields, and how its data is stored.
   */
  static create(): RulesetModule<Dnd35Descriptions, Dnd35EntityKinds, SeededFields> {
    return {
      characters: new Dnd35Characters(DND35_STORAGE),
      content: new Dnd35Content(),
      entities: new Dnd35Entities(),
      fields: ENTITY_FIELDS,
      imports: new Dnd35Imports(),
      kindLabels: KIND_LABELS,
      levelUp: new Dnd35LevelUp(),
      ruleset: new Dnd35Ruleset(),
      storage: DND35_STORAGE,

      createTargetPaths() {
        return new Dnd35TargetPaths();
      },
    };
  }
}
