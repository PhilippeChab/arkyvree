import { sortProperties } from "@/shared/dnd3.5/properties/index.ts";
import type { Character as CharacterRecord, Property } from "@/shared/relations.ts";

import { createCharacter } from "./character/buildCharacter.ts";
import { Dnd35Characters } from "./character/Dnd35Characters.ts";
import { Dnd35Content } from "./content/Dnd35Content.ts";
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
    content: new Dnd35Content(),
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

    orderProperties(properties: Property[]) {
      return sortProperties(properties);
    },
  };
}
