/** A list's cards of characters from several rulesets, each described in its own ruleset's view. */

import { Engine } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";

/** What a list shows of a character whose ruleset it didn't read (an archived one's): no race, no classes. */
const UNREAD_CARD = { levels: [], race: "Unknown", totalLevel: 0 };

/**
 * The cards of a list of characters (each with its ruleset's view among `views`, `withRulesetScopes`', and its levels
 * among `levels`), as the engine describes each: its race, its classes at their highest level, its total level.
 */
export function describeCharacterCards(
  views: Map<string, RulesetScope>,
  characters: { id: string; raceId: string; rulesetId: string }[],
  levels: { characterId: string; klassLevelId: string }[],
) {
  const levelsByCharacter = Map.groupBy(levels, (level) => level.characterId);
  return new Map(
    characters.map((character) => {
      const view = views.get(character.rulesetId);
      const characterLevels = levelsByCharacter.get(character.id) ?? [];
      return [
        character.id,
        view ? Engine.for(view).characters().describeCard(character, characterLevels) : UNREAD_CARD,
      ];
    }),
  );
}
