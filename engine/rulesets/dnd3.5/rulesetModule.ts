import type { Character as CharacterRecord } from "@/shared/relations.ts";

import { createCharacter } from "./character/buildCharacter.ts";
import { Dnd35Characters } from "./character/Dnd35Characters.ts";
import { Dnd35Entities } from "./Dnd35Entities.ts";
import Dnd35PropertyTypes from "./Dnd35PropertyTypes.ts";
import Dnd35TargetPaths from "./Dnd35TargetPaths.ts";
import { Dnd35LevelUp } from "./levelUp/Dnd35LevelUp.ts";
import type { CharacterKind, Dnd35RulesetModule } from "./types.ts";

/**
 * The 3.5 rules as a ruleset module: its characters and their sheets, its entities, its level-ups, paths and
 * properties.
 */
export function createRulesetModule(): Dnd35RulesetModule {
  return {
    characters: new Dnd35Characters(),
    entities: new Dnd35Entities(),
    levelUp: new Dnd35LevelUp(),

    createDetailedCharacter(record: CharacterRecord, kind: CharacterKind = "pc") {
      return createCharacter(record, kind);
    },

    createTargetPaths() {
      return new Dnd35TargetPaths();
    },

    createPropertyTypes() {
      return new Dnd35PropertyTypes();
    },
  };
}
