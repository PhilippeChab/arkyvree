/** A list's cards of characters from several rulesets, each described in its own ruleset's view. */

import { type CharacterCard, Engine } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";

/** What a list shows of a character whose ruleset it didn't read (an archived one's): an unknown race's chip alone. */
const UNREAD_CARD = {
  chips: [{ label: "Unknown", partial: true, tone: "secondary" }],
} satisfies CharacterCard;

/**
 * The cards of a list of characters (each with its ruleset's view among `views`, `withRulesetScopes`', and its levels
 * among `levels`), as the engine describes each: its chips (a partly seen one's, among `partialIds`, its partial
 * reading's): its race, then its classes at their highest level.
 */
export function describeCharacterCards(
  views: Map<string, RulesetScope>,
  characters: { id: string; raceId: string; rulesetId: string }[],
  levels: { characterId: string; klassLevelId: string }[],
  partialIds: ReadonlySet<string>,
) {
  const levelsByCharacter = Map.groupBy(levels, (level) => level.characterId);
  return new Map(
    characters.map((character) => {
      const view = views.get(character.rulesetId);
      const characterLevels = levelsByCharacter.get(character.id) ?? [];
      return [
        character.id,
        view
          ? Engine.for(view).characters().describeCard(character, characterLevels, partialIds.has(character.id))
          : UNREAD_CARD,
      ];
    }),
  );
}
