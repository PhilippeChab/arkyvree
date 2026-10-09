import { ModifierEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { BaseRules } from "@/shared/enums.ts";

import ContentEngine from "./ContentEngine.ts";
import CopyOnWriteEngine from "./CopyOnWriteEngine.ts";
import Modules from "./Modules.ts";
import RulesetEngine from "./RulesetEngine.ts";

/**
 * The engine's entry: what code outside it asks the rules, as the client asks the server through its API. A ruleset's
 * rules answer through a handle bound to its view (`Engine.for(scope)`), and through it to what they're about
 * (`.character(input)`, `.class(klassId)`, `.skills()`); a base rules' content before any view (`forRules`); and
 * copy-on-write, which builds the view (`copyOnWrite`). Which ruleset answers is the engine's to know.
 */
export default class Engine {
  /** The copy-on-write the cache builds a ruleset's view with, and its writes copy an entity by. */
  static copyOnWrite() {
    return new CopyOnWriteEngine();
  }

  /**
   * The cards of a list of characters (each with its ruleset's view among `views`, and its levels among `levels`), as
   * the list shows them: its race, its classes at their highest level, its total level. A character whose ruleset the
   * list didn't read shows none.
   */
  static describeCharacterCards(
    views: Map<string, RulesetView>,
    characters: { id: string; raceId: string; rulesetId: string }[],
    levels: { characterId: string; klassLevelId: string }[],
  ) {
    const levelsByCharacter = Map.groupBy(levels, (level) => level.characterId);
    return new Map(
      characters.map((character) => {
        const view = views.get(character.rulesetId);
        const card = view
          ? Engine.for(view)
              .characters()
              .describeCard(character, levelsByCharacter.get(character.id) ?? [])
          : { levels: [], race: "Unknown", totalLevel: 0 };
        return [character.id, card];
      }),
    );
  }

  /**
   * Modifiers as a list shows them, an entity's or a character's: their target's segments' labels, and their value's
   * name when their path names its values, among the catalog of a modifier's paths.
   */
  static describeModifierList<T extends { target: string; value: string }>(catalog: TargetPathCatalog, modifiers: T[]) {
    return ModifierEdits.describe(catalog, modifiers);
  }

  /** The engine bound to a ruleset's view: its rules, by what they're about. */
  static for(view: RulesetView) {
    return new RulesetEngine(view);
  }

  /** The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view. */
  static forRules(baseRules: BaseRules) {
    return new ContentEngine(Modules.of(baseRules));
  }
}
