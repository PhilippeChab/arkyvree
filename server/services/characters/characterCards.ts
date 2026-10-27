/** A list's cards of characters from several rulesets, each described in its own ruleset's view. */

import { Engine, type StoredAdvancement } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * The cards of a list of characters (each with its ruleset's view among `views`, `withRulesetScopes`', and its
 * advancements among `advancements`), as the engine describes each: its chips (a partly seen one's, among
 * `partialIds`, its partial reading's): its race, then its classes at their highest level.
 */
export function describeCharacterCards(
  views: Map<string, RulesetScope>,
  characters: Character[],
  advancements: StoredAdvancement[],
  partialIds: ReadonlySet<string>,
) {
  const byCharacter = Map.groupBy(advancements, (advancement) => advancement.characterId);
  return new Map(
    characters.map((character) => {
      const view = views.get(character.rulesetId);
      const own = byCharacter.get(character.id) ?? [];
      return [
        character.id,
        view
          ? Engine.for(view).characters().describeCard(character, own, partialIds.has(character.id))
          : Engine.UNREAD_CARD,
      ];
    }),
  );
}
